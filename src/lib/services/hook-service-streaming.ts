/**
 * Streaming wrapper around hook generation.
 * Generates hooks in batches of ~10, emitting SSE events after each batch
 * is validated and filtered, so the client sees hooks progressively.
 *
 * For fact-mode topics, delegates to the V2 Hook Engine pipeline which
 * includes the LLM validator as source of truth. The V2 result is then
 * emitted as SSE events to match the streaming contract.
 */

import { prisma } from '@/lib/db/prisma';
import { getAIProvider } from '@/lib/ai/provider';
import { buildHookImprovementPrompt } from '@/lib/prompts/hook-generation';
import { buildRealityGroundedHooksPrompt } from '@/lib/prompts/reality-grounded-hooks';
import { buildKnowledgeGroundedHooksPrompt } from '@/lib/prompts/knowledge-grounded-hooks';
import { fetchTopicEvents, type TopicEvent } from '@/lib/external/topic-events';
import { fetchTopicKnowledge, type TopicKnowledge, type KnowledgeFact } from '@/lib/external/topic-knowledge';
import { GeneratedHooks, RealityGroundedHooks, KnowledgeGroundedHooks } from '@/lib/validation/schemas';
import { scoreAllHooks, checkDiversity, getWeakHookIndices } from '@/lib/utils/hook-quality';
import { filterRealityGroundedHooks } from '@/lib/utils/reality-hook-filter';
import { filterKnowledgeGroundedHooks } from '@/lib/utils/knowledge-hook-filter';
import { classifyTopic, type GroundingMode } from '@/lib/utils/topic-classifier';
import { contentModeFromIntent, type TopicContentMode } from '@/lib/utils/topic-classifier';
import { hookGenerationTelemetry } from '@/lib/services/hook-service';
import { inferContentStyle } from '@/lib/utils/content-style-inferrer';
import {
  preFilterFactHooks,
  llmValidateFactHooks,
  normalizeHookText,
  MIN_TOTAL_SCORE,
  MIN_CURIOSITY_GAP,
  TOP_HOOKS_COUNT,
} from '@/lib/services/hook-engine-v2';
import {
  buildHookGenerationV2Prompt,
  buildHookScoringV2Prompt,
  buildHookRefinementV2Prompt,
} from '@/lib/prompts/hook-engine-v2';
import {
  GeneratedHooksV2,
  ScoredHooksV2,
  RefinedHooksV2,
  type HookV2Scores,
  type HookEngineV2Output,
} from '@/lib/validation/schemas';

// ─── SSE Event Types ─────────────────────────────────────────

export interface StreamHook {
  text: string;
  type: 'CONTRARIAN' | 'CALL_OUT' | 'MISTAKE_EXPOSURE' | 'HIDDEN_TRUTH';
  visualHint: string;
  dayIndex: number;
}

export type HookStreamEvent =
  | { event: 'phase'; data: { phase: string; message: string; groundingMode?: GroundingMode } }
  | { event: 'batch'; data: { batchIndex: number; hooks: StreamHook[]; progress: { generated: number; filtered: number; target: number } } }
  | { event: 'complete'; data: { totalHooks: number; groundingMode: GroundingMode; groundingSource: string } }
  | { event: 'error'; data: { error: string } };

type GroundingSource =
  | 'news_external'
  | 'news_internal_fallback'
  | 'knowledge_external'
  | 'knowledge_internal_fallback'
  | 'mixed_knowledge_and_news'
  | 'mixed_knowledge_only'
  | 'mixed_news_only';

// ─── Helpers ─────────────────────────────────────────────────

function mapAngleToType(angle: string): 'CONTRARIAN' | 'CALL_OUT' | 'MISTAKE_EXPOSURE' | 'HIDDEN_TRUTH' {
  const mapping: Record<string, 'CONTRARIAN' | 'CALL_OUT' | 'MISTAKE_EXPOSURE' | 'HIDDEN_TRUTH'> = {
    insight: 'HIDDEN_TRUTH',
    controversy: 'CONTRARIAN',
    irony: 'CALL_OUT',
    data: 'MISTAKE_EXPOSURE',
    surprising: 'CALL_OUT',
    'myth-busting': 'CONTRARIAN',
  };
  return mapping[angle] || 'HIDDEN_TRUTH';
}

function isInternalFallbackAllowed(): boolean {
  const flag = process.env.ALLOW_INTERNAL_HOOK_FALLBACK;
  if (flag === undefined || flag === '') return true;
  return flag.toLowerCase() === 'true';
}

const BATCH_SIZE = 10;
const TOTAL_TARGET = 30;

// ─── Main streaming entry point ──────────────────────────────

export async function* generateHooksStreaming(channelId: string): AsyncGenerator<HookStreamEvent> {
  // ─── Validate channel ───────────────────────────────────────
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { memory: true },
  });

  if (!channel) throw new Error('Channel not found');
  if (!channel.niche) throw new Error('No niche selected for this channel');

  const topic = channel.niche!;

  // ─── Route: V2 Hook Engine for fact topics ─────────────────
  // Derive contentMode from explicit contentIntent (set at niche selection).
  // Falls back to legacy classifier if contentIntent is not yet set.
  const exploreSource = channel.nicheMode === 'EXPLORE' ? channel.exploreTopic : undefined;
  const contentMode: TopicContentMode = contentModeFromIntent(channel.contentIntent, topic, exploreSource ?? undefined);

  if (contentMode === 'fact') {
    yield* generateHooksStreamingV2(channelId, topic, contentMode);
    return;
  }

  // ─── Legacy streaming path (non-fact topics only) ──────────
  const positioning = inferContentStyle(topic);

  // ─── Step 0: Classify ──────────────────────────────────────
  const classification = classifyTopic(topic);
  const { mode: groundingMode, reason: routingReason } = classification;

  hookGenerationTelemetry.classifierDecision.push({ topic, mode: groundingMode, reason: routingReason });
  if (hookGenerationTelemetry.classifierDecision.length > 100) hookGenerationTelemetry.classifierDecision.shift();

  switch (groundingMode) {
    case 'news': hookGenerationTelemetry.modeNews++; break;
    case 'knowledge': hookGenerationTelemetry.modeKnowledge++; break;
    case 'mixed': hookGenerationTelemetry.modeMixed++; break;
  }

  yield { event: 'phase', data: { phase: 'classifying', message: `Mode: ${groundingMode} (${routingReason})`, groundingMode } };

  // ─── Step 1: Fetch context ─────────────────────────────────
  yield { event: 'phase', data: { phase: 'fetching_context', message: `Fetching ${groundingMode} context for "${topic}"...` } };

  let externalEvents: TopicEvent[] | undefined;
  let knowledge: TopicKnowledge | undefined;
  let groundingSource: GroundingSource;
  let fallbackUsed = false;

  if (groundingMode === 'news' || groundingMode === 'mixed') {
    try {
      externalEvents = await fetchTopicEvents(topic, 10);
      if (externalEvents.length === 0) externalEvents = undefined;
      else hookGenerationTelemetry.externalFetchSuccess++;
    } catch {
      hookGenerationTelemetry.externalFetchFailure++;
      externalEvents = undefined;
    }
  }

  if (groundingMode === 'knowledge' || groundingMode === 'mixed') {
    try {
      knowledge = await fetchTopicKnowledge(topic, 15);
      hookGenerationTelemetry.knowledgeFetchSuccess++;
    } catch {
      hookGenerationTelemetry.knowledgeFetchFailure++;
      knowledge = undefined;
    }
  }

  // Resolve grounding source
  groundingSource = resolveGroundingSource(groundingMode, knowledge, externalEvents);
  if (groundingSource.includes('fallback')) fallbackUsed = true;

  // Check fallback allowed
  if (fallbackUsed && !isInternalFallbackAllowed()) {
    yield { event: 'error', data: { error: `Context fetch failed and ALLOW_INTERNAL_HOOK_FALLBACK=false.` } };
    return;
  }

  // ─── Step 2: Generate in batches ───────────────────────────
  yield { event: 'phase', data: { phase: 'generating', message: 'Generating hooks in batches...' } };

  const ai = getAIProvider();
  const allHooks: Array<{ text: string; type: 'CONTRARIAN' | 'CALL_OUT' | 'MISTAKE_EXPOSURE' | 'HIDDEN_TRUTH'; visualHint: string; pattern: string | undefined }> = [];
  let totalGenerated = 0;
  let totalRejected = 0;
  const batchCount = Math.ceil(TOTAL_TARGET / BATCH_SIZE);

  for (let batchIdx = 0; batchIdx < batchCount; batchIdx++) {
    const alreadyGenerated = allHooks.map(h => h.text);
    const batchTarget = Math.min(BATCH_SIZE, TOTAL_TARGET - totalGenerated);

    try {
      const batchHooks = await generateBatch({
        topic,
        batchTarget,
        groundingMode,
        knowledge,
        externalEvents,
        avoidTexts: alreadyGenerated,
        ai,
      });

      totalGenerated += batchHooks.generated;
      totalRejected += batchHooks.rejected;

      // Deduplicate against previous batches
      const seen = new Set(allHooks.map(h => h.text.toLowerCase().trim()));
      const newHooks = batchHooks.hooks.filter(h => {
        const key = h.text.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Assign dayIndex starting from current length
      const startIndex = allHooks.length;
      allHooks.push(...newHooks);

      // Emit batch event
      yield {
        event: 'batch',
        data: {
          batchIndex: batchIdx,
          hooks: newHooks.map((h, i) => ({
            text: h.text,
            type: h.type,
            visualHint: h.visualHint,
            dayIndex: startIndex + i + 1,
          })),
          progress: {
            generated: totalGenerated,
            filtered: allHooks.length,
            target: TOTAL_TARGET,
          },
        },
      };
    } catch (err) {
      console.warn(`[hook-service-streaming] Batch ${batchIdx} failed:`, err);
      // Continue with next batch — don't abort the whole generation
    }
  }

  if (allHooks.length === 0) {
    yield { event: 'error', data: { error: 'All generation batches failed. No hooks produced.' } };
    return;
  }

  hookGenerationTelemetry.hooksRejectedByFilter += totalRejected;

  // ─── Step 3: Score & improve ───────────────────────────────
  yield { event: 'phase', data: { phase: 'scoring', message: `Scoring ${allHooks.length} hooks...` } };

  let hooks = [...allHooks];
  let scored = scoreAllHooks(hooks);
  const weakIndices = getWeakHookIndices(scored, 7, 6);

  if (weakIndices.length > 0) {
    yield { event: 'phase', data: { phase: 'improving', message: `Improving ${weakIndices.length} weak hooks...` } };

    try {
      const weakHooks = weakIndices.map(i => ({
        text: hooks[i].text,
        type: hooks[i].type,
        issues: scored[i].flags,
      }));

      const improvementPrompt = buildHookImprovementPrompt(weakHooks, {
        niche: channel.niche,
        positioning: { angle: positioning.angle, tone: positioning.tone },
      });

      const { data: improved } = await ai.generateObject(improvementPrompt, GeneratedHooks);
      const replacements = improved.hooks.slice(0, weakIndices.length);

      for (let i = 0; i < replacements.length; i++) {
        const targetIdx = weakIndices[i];
        hooks[targetIdx] = {
          text: replacements[i].text,
          type: replacements[i].type,
          visualHint: replacements[i].visualHint || '',
          pattern: replacements[i].pattern,
        };
      }

      scored = scoreAllHooks(hooks);
    } catch {
      console.warn('[hook-service-streaming] Improvement pass failed, using originals');
    }
  }

  // ─── Step 4: Save to DB ────────────────────────────────────
  yield { event: 'phase', data: { phase: 'saving', message: 'Saving hooks to database...' } };

  await prisma.post.deleteMany({ where: { channelId } });

  const posts = await Promise.all(
    hooks.map((hook, index) => {
      const words = hook.text.split(/\s+/).filter(Boolean);
      const titleWordCount = Math.min(6, words.length);
      const rawTitle = words.slice(0, titleWordCount).join(' ');
      const title = rawTitle.replace(/[,;:!?.…—\-]+$/, '');
      const visualHint = hook.visualHint || scored[index]?.visualHint || null;

      return prisma.post.create({
        data: {
          channelId,
          dayIndex: index + 1,
          title,
          hook: hook.text,
          visualHint,
          pattern: (hook.pattern as 'CONTRAST' | 'MISTAKE' | 'MYTH' | 'LIST' | 'STORY' | 'BREAKDOWN' | 'OPINION') || null,
          type: hook.type,
          status: 'DRAFT',
        },
      });
    })
  );

  const typeCounts: Record<string, number> = {};
  for (const hook of hooks) typeCounts[hook.type] = (typeCounts[hook.type] || 0) + 1;

  const diversity = checkDiversity(hooks);

  await prisma.generationJob.create({
    data: {
      channelId,
      jobType: 'HOOK_GENERATION',
      status: 'COMPLETED',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: {
        hookCount: hooks.length,
        averageScore: scored.reduce((sum, h) => sum + h.scores.average, 0) / scored.length,
        weakHooksImproved: weakIndices.length,
        typeCounts,
        diversityViolations: diversity.violations,
        groundingMode,
        routingReason,
        groundingSource,
        fallbackUsed,
        hooksRejectedByFilter: totalRejected,
        streamed: true,
      } as any,
    },
  });

  await prisma.channel.update({
    where: { id: channelId },
    data: { status: 'HOOKS_GENERATED' },
  });

  yield {
    event: 'complete',
    data: {
      totalHooks: posts.length,
      groundingMode,
      groundingSource,
    },
  };
}

// ─── Batch generation ────────────────────────────────────────

interface BatchInput {
  topic: string;
  batchTarget: number;
  groundingMode: GroundingMode;
  knowledge: TopicKnowledge | undefined;
  externalEvents: TopicEvent[] | undefined;
  avoidTexts: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ai: any;
}

interface BatchOutput {
  hooks: Array<{ text: string; type: 'CONTRARIAN' | 'CALL_OUT' | 'MISTAKE_EXPOSURE' | 'HIDDEN_TRUTH'; visualHint: string; pattern: string | undefined }>;
  generated: number;
  rejected: number;
}

async function generateBatch(input: BatchInput): Promise<BatchOutput> {
  const { topic, batchTarget, groundingMode, knowledge, externalEvents, avoidTexts, ai } = input;

  const avoidSuffix = avoidTexts.length > 0
    ? `\n\nALREADY GENERATED (do NOT repeat or paraphrase these):\n${avoidTexts.map((t, i) => `- ${t}`).join('\n')}`
    : '';

  if ((groundingMode === 'knowledge' || groundingMode === 'mixed') && knowledge && knowledge.facts.length >= 3) {
    const prompt = buildKnowledgeGroundedHooksPrompt(topic, knowledge.facts, batchTarget) + avoidSuffix;
    const { data: generated } = await ai.generateObject(prompt, KnowledgeGroundedHooks);
    const filtered = filterKnowledgeGroundedHooks(generated.hooks, knowledge.facts);

    return {
      hooks: filtered.map(h => ({
        text: h.text,
        type: mapAngleToType(h.angle),
        visualHint: `[${knowledge.source}] ${h.fact_refs.join(', ')}`,
        pattern: undefined,
      })),
      generated: generated.hooks.length,
      rejected: generated.hooks.length - filtered.length,
    };
  }

  if ((groundingMode === 'news' || groundingMode === 'mixed') && externalEvents && externalEvents.length > 0) {
    const prompt = buildRealityGroundedHooksPrompt(topic, batchTarget, externalEvents) + avoidSuffix;
    const { data: generated } = await ai.generateObject(prompt, RealityGroundedHooks);
    const filtered = filterRealityGroundedHooks(generated.hooks);

    return {
      hooks: filtered.map(h => ({
        text: h.text,
        type: mapAngleToType(h.angle),
        visualHint: h.event_summary,
        pattern: undefined,
      })),
      generated: generated.hooks.length,
      rejected: generated.hooks.length - filtered.length,
    };
  }

  // Internal fallback
  const prompt = buildRealityGroundedHooksPrompt(topic, batchTarget, undefined) + avoidSuffix;
  const { data: generated } = await ai.generateObject(prompt, RealityGroundedHooks);
  const filtered = filterRealityGroundedHooks(generated.hooks);

  return {
    hooks: filtered.map(h => ({
      text: h.text,
      type: mapAngleToType(h.angle),
      visualHint: h.event_summary,
      pattern: undefined,
    })),
    generated: generated.hooks.length,
    rejected: generated.hooks.length - filtered.length,
  };
}

// ─── Source resolution ───────────────────────────────────────

function resolveGroundingSource(
  mode: GroundingMode,
  knowledge: TopicKnowledge | undefined,
  events: TopicEvent[] | undefined,
): GroundingSource {
  const hasKnowledge = knowledge && knowledge.facts.length >= 3;
  const hasNews = events && events.length > 0;

  if (mode === 'news') {
    return hasNews ? 'news_external' : 'news_internal_fallback';
  }

  if (mode === 'knowledge') {
    return hasKnowledge ? 'knowledge_external' : 'knowledge_internal_fallback';
  }

  // mixed
  if (hasKnowledge && hasNews) return 'mixed_knowledge_and_news';
  if (hasKnowledge) return 'mixed_knowledge_only';
  if (hasNews) return 'mixed_news_only';
  return 'knowledge_internal_fallback';
}

// ═══════════════════════════════════════════════════════════════
// V2 Hook Engine — Progressive SSE streaming wrapper
// Runs V2 pipeline steps individually, emitting SSE events after
// each stage so hooks appear in real time on the frontend.
// ═══════════════════════════════════════════════════════════════

async function* generateHooksStreamingV2(channelId: string, topic: string, contentMode: TopicContentMode): AsyncGenerator<HookStreamEvent> {
  const ai = getAIProvider();
  const TARGET = 20;

  // Track permanently rejected hooks — once rejected, never returns.
  const permanentlyRejected = new Set<string>();

  yield { event: 'phase', data: { phase: 'classifying', message: `Fact topic detected — using V2 Hook Engine`, groundingMode: 'knowledge' } };

  // ─── STEP 1: GENERATE ──────────────────────────────────────
  yield { event: 'phase', data: { phase: 'generating', message: `Generating ${TARGET} hook candidates...` } };

  let rawHooks: string[];
  try {
    const prompt = buildHookGenerationV2Prompt({ topic, contentMode, count: TARGET });
    const { data: generated } = await ai.generateObject(prompt, GeneratedHooksV2);
    rawHooks = generated.hooks.map(h => h.hook);
  } catch (err) {
    yield { event: 'error', data: { error: err instanceof Error ? err.message : 'Generation failed' } };
    return;
  }

  // Emit raw candidates immediately — the user sees hooks appearing
  yield {
    event: 'batch',
    data: {
      batchIndex: 0,
      hooks: rawHooks.map((text, i) => ({
        text,
        type: 'HIDDEN_TRUTH' as const,
        visualHint: '',
        dayIndex: i + 1,
      })),
      progress: { generated: rawHooks.length, filtered: rawHooks.length, target: TARGET },
    },
  };

  // ─── STEP 2: PRE-FILTER ────────────────────────────────────
  yield { event: 'phase', data: { phase: 'filtering', message: `Pre-filtering ${rawHooks.length} hooks...` } };

  const { passed: preFiltered, rejected: preRejected } = preFilterFactHooks(rawHooks, contentMode);
  for (const r of preRejected) {
    permanentlyRejected.add(normalizeHookText(r.hook));
  }

  // ─── STEP 3: LLM VALIDATE ─────────────────────────────────
  yield { event: 'phase', data: { phase: 'validating', message: `LLM validating ${preFiltered.length} hooks...` } };

  const llmResult = await llmValidateFactHooks(preFiltered, contentMode);
  for (const r of llmResult.rejected) {
    permanentlyRejected.add(normalizeHookText(r.hook));
  }

  const primaryHooks = llmResult.accepted;
  const borderlinePool = llmResult.borderline;

  const scoringPool = [
    ...primaryHooks.filter(h => !permanentlyRejected.has(normalizeHookText(h))),
    ...borderlinePool.filter(h => !permanentlyRejected.has(normalizeHookText(h))),
  ];

  if (scoringPool.length === 0) {
    yield { event: 'error', data: { error: 'All hooks rejected by validator. No fact-based hooks survived.' } };
    return;
  }

  // Emit validated hooks — replaces the raw candidates in the UI
  yield {
    event: 'batch',
    data: {
      batchIndex: 1,
      hooks: scoringPool.map((text, i) => ({
        text,
        type: 'HIDDEN_TRUTH' as const,
        visualHint: '',
        dayIndex: i + 1,
      })),
      progress: {
        generated: rawHooks.length,
        filtered: scoringPool.length,
        target: Math.min(TOP_HOOKS_COUNT, scoringPool.length),
      },
    },
  };

  // ─── STEP 4: SCORE ─────────────────────────────────────────
  yield { event: 'phase', data: { phase: 'scoring', message: `Scoring ${scoringPool.length} validated hooks...` } };

  const scorePrompt = buildHookScoringV2Prompt(scoringPool, contentMode);
  const { data: scored } = await ai.generateObject(scorePrompt, ScoredHooksV2);

  const scoreMap = new Map<string, HookV2Scores>();
  for (const item of scored.hooks) {
    const computed =
      item.scores.curiosityGap + item.scores.clarity + item.scores.novelty +
      item.scores.emotionalTrigger + item.scores.specificity;
    scoreMap.set(normalizeHookText(item.hook), { ...item.scores, totalScore: computed });
  }

  const defaultScores: HookV2Scores = {
    curiosityGap: 0, clarity: 0, novelty: 0,
    emotionalTrigger: 0, specificity: 0, totalScore: 0,
  };

  const scoredHooks = scoringPool.map(hook => ({
    hook,
    scores: scoreMap.get(normalizeHookText(hook)) ?? defaultScores,
  }));

  const aboveThreshold = scoredHooks.filter(
    h => h.scores.totalScore >= MIN_TOTAL_SCORE && h.scores.curiosityGap >= MIN_CURIOSITY_GAP
  );

  // ─── STEP 5: FILTER TOP N ─────────────────────────────────
  yield { event: 'phase', data: { phase: 'selecting', message: `Selecting top ${TOP_HOOKS_COUNT} hooks...` } };

  const acceptedSet = new Set(primaryHooks.map(h => normalizeHookText(h)));

  const sortedAccepted = aboveThreshold
    .filter(h => acceptedSet.has(normalizeHookText(h.hook)))
    .sort((a, b) => b.scores.totalScore - a.scores.totalScore);
  const sortedBorderline = aboveThreshold
    .filter(h => !acceptedSet.has(normalizeHookText(h.hook)))
    .sort((a, b) => b.scores.totalScore - a.scores.totalScore);

  const topHooks = sortedAccepted.slice(0, TOP_HOOKS_COUNT);

  if (topHooks.length < TOP_HOOKS_COUNT) {
    const backfillNeeded = TOP_HOOKS_COUNT - topHooks.length;
    topHooks.push(...sortedBorderline.slice(0, backfillNeeded));
  }

  if (topHooks.length < TOP_HOOKS_COUNT) {
    const belowThreshold = scoredHooks
      .filter(h => acceptedSet.has(normalizeHookText(h.hook)) && !topHooks.some(t => t.hook === h.hook))
      .sort((a, b) => b.scores.totalScore - a.scores.totalScore);
    topHooks.push(...belowThreshold.slice(0, TOP_HOOKS_COUNT - topHooks.length));
  }

  const cleanTopHooks = topHooks.filter(h => !permanentlyRejected.has(normalizeHookText(h.hook)));

  if (cleanTopHooks.length === 0) {
    yield { event: 'error', data: { error: 'No hooks passed scoring threshold.' } };
    return;
  }

  // ─── STEP 6: REFINE ───────────────────────────────────────
  yield { event: 'phase', data: { phase: 'refining', message: `Refining ${cleanTopHooks.length} top hooks...` } };

  const topTexts = cleanTopHooks.map(h => h.hook);
  const refinePrompt = buildHookRefinementV2Prompt(topTexts, contentMode);
  const { data: refined } = await ai.generateObject(refinePrompt, RefinedHooksV2);

  const refinementMap = new Map<string, string>();
  for (const item of refined.hooks) {
    refinementMap.set(normalizeHookText(item.original), item.improved);
  }

  // Post-refine LLM re-validation
  let postRefineReverted = 0;
  const refinedTexts = cleanTopHooks.map(h =>
    refinementMap.get(normalizeHookText(h.hook)) ?? h.hook
  );

  const postResult = await llmValidateFactHooks(refinedTexts, contentMode);
  const postRejectedSet = new Set(postResult.rejected.map(r => normalizeHookText(r.hook)));

  for (const h of cleanTopHooks) {
    const refinedText = refinementMap.get(normalizeHookText(h.hook)) ?? h.hook;
    if (postRejectedSet.has(normalizeHookText(refinedText))) {
      refinementMap.set(normalizeHookText(h.hook), h.hook);
      postRefineReverted++;
    }
  }

  // Assemble final output
  const finalHooks: HookEngineV2Output[] = cleanTopHooks.map(h => ({
    hook: h.hook,
    scores: h.scores,
    improved: refinementMap.get(normalizeHookText(h.hook)) ?? h.hook,
  }));

  const trulyFinal = finalHooks.filter(h =>
    !permanentlyRejected.has(normalizeHookText(h.hook)) &&
    !permanentlyRejected.has(normalizeHookText(h.improved))
  );

  if (trulyFinal.length === 0) {
    yield { event: 'error', data: { error: 'All hooks were rejected after refinement.' } };
    return;
  }

  // Emit final refined hooks — the user sees the polished versions
  yield {
    event: 'batch',
    data: {
      batchIndex: 2,
      hooks: trulyFinal.map((h, i) => ({
        text: h.improved,
        type: 'HIDDEN_TRUTH' as const,
        visualHint: '',
        dayIndex: i + 1,
      })),
      progress: {
        generated: rawHooks.length,
        filtered: trulyFinal.length,
        target: trulyFinal.length,
      },
    },
  };

  // ─── SAVE TO DB ────────────────────────────────────────────
  yield { event: 'phase', data: { phase: 'saving', message: `Saving ${trulyFinal.length} validated hooks...` } };

  await prisma.post.deleteMany({ where: { channelId } });

  await Promise.all(
    trulyFinal.map((hook, index) => {
      const text = hook.improved;
      const words = text.split(/\s+/).filter(Boolean);
      const titleWordCount = Math.min(6, words.length);
      const rawTitle = words.slice(0, titleWordCount).join(' ');
      const title = rawTitle.replace(/[,;:!?.…—\-]+$/, '');

      return prisma.post.create({
        data: {
          channelId,
          dayIndex: index + 1,
          title,
          hook: text,
          visualHint: null,
          pattern: null,
          type: 'HIDDEN_TRUTH',
          status: 'DRAFT',
        },
      });
    })
  );

  const pipelineStats = {
    generated: rawHooks.length,
    preFilterRejected: preRejected.length,
    llmValidatorAccepted: primaryHooks.length,
    llmValidatorBorderline: borderlinePool.length,
    llmValidatorRejected: llmResult.rejected.length,
    scoredAboveThreshold: aboveThreshold.length,
    filteredTop: cleanTopHooks.length,
    refined: refined.hooks.length,
    postRefineReverted,
    contentMode,
  };

  await prisma.generationJob.create({
    data: {
      channelId,
      jobType: 'HOOK_GENERATION',
      status: 'COMPLETED',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: {
        engine: 'v2',
        streamed: true,
        hookCount: trulyFinal.length,
        pipelineStats,
        hooks: trulyFinal.map(h => ({
          hook: h.hook,
          improved: h.improved,
          scores: h.scores,
        })),
      } as any,
    },
  });

  await prisma.channel.update({
    where: { id: channelId },
    data: { status: 'HOOKS_GENERATED' },
  });

  yield {
    event: 'complete',
    data: {
      totalHooks: trulyFinal.length,
      groundingMode: 'knowledge' as GroundingMode,
      groundingSource: 'v2_hook_engine',
    },
  };
}
