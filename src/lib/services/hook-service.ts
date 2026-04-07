import { prisma } from '@/lib/db/prisma';
import { getAIProvider } from '@/lib/ai/provider';
import { buildHookGenerationPrompt, buildHookImprovementPrompt } from '@/lib/prompts/hook-generation';
import { buildRealityGroundedHooksPrompt } from '@/lib/prompts/reality-grounded-hooks';
import { buildKnowledgeGroundedHooksPrompt } from '@/lib/prompts/knowledge-grounded-hooks';
import { fetchTopicEvents, type TopicEvent } from '@/lib/external/topic-events';
import { fetchTopicKnowledge, type TopicKnowledge } from '@/lib/external/topic-knowledge';
import { GeneratedHooks, RealityGroundedHooks, KnowledgeGroundedHooks } from '@/lib/validation/schemas';
import { scoreAllHooks, checkDiversity, getWeakHookIndices } from '@/lib/utils/hook-quality';
import { filterRealityGroundedHooks } from '@/lib/utils/reality-hook-filter';
import { filterKnowledgeGroundedHooks } from '@/lib/utils/knowledge-hook-filter';
import { classifyTopic, contentModeFromIntent, type GroundingMode, type ClassificationResult, type TopicContentMode } from '@/lib/utils/topic-classifier';
import { inferContentStyle } from '@/lib/utils/content-style-inferrer';
import { generateHooksV2, type HookEngineV2Result } from '@/lib/services/hook-engine-v2';

// Re-export V2 engine for direct usage
export { generateHooksV2, type HookEngineV2Result } from '@/lib/services/hook-engine-v2';

// ─── Telemetry counters (in-memory, per-process) ─────────────

export const hookGenerationTelemetry = {
  externalFetchSuccess: 0,
  externalFetchFailure: 0,
  internalFallback: 0,
  hooksRejectedByFilter: 0,
  knowledgeFetchSuccess: 0,
  knowledgeFetchFailure: 0,
  modeNews: 0,
  modeKnowledge: 0,
  modeMixed: 0,
  crossModeFallbackPrevented: 0,
  classifierDecision: [] as Array<{ topic: string; mode: GroundingMode; reason: string }>,
};

// ─── Types ───────────────────────────────────────────────────

type GroundingSource =
  | 'news_external'
  | 'news_internal_fallback'
  | 'knowledge_external'
  | 'knowledge_internal_fallback'
  | 'mixed_knowledge_and_news'
  | 'mixed_knowledge_only'
  | 'mixed_news_only';

interface HookResult {
  hooks: Array<{
    text: string;
    type: 'CONTRARIAN' | 'CALL_OUT' | 'MISTAKE_EXPOSURE' | 'HIDDEN_TRUTH';
    visualHint: string;
    pattern: string | undefined;
  }>;
  rejectedCount: number;
  groundingSource: GroundingSource;
  fallbackUsed: boolean;
}

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

// ─── Hook Engine V2 check ────────────────────────────────────

function useHookEngineV2(): boolean {
  const flag = process.env.USE_HOOK_ENGINE_V2;
  // Default to V2 unless explicitly disabled
  if (flag === undefined || flag === '') return true;
  return flag.toLowerCase() !== 'false';
}

// ─── Main entry point ────────────────────────────────────────

export async function generateHooks(channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { memory: true },
  });

  if (!channel) {
    throw new Error('Channel not found');
  }

  if (!channel.niche) {
    throw new Error('No niche selected for this channel');
  }

  const topic = channel.niche!;

  // ─── Route: V2 Hook Engine or legacy pipeline ─────────────
  if (useHookEngineV2()) {
    const exploreSource = channel.nicheMode === 'EXPLORE' ? channel.exploreTopic : null;
    return generateHooksWithV2Engine(channelId, topic, exploreSource ?? undefined, channel.contentIntent ?? undefined);
  }

  return generateHooksLegacy(channelId, topic);
}

// ═══════════════════════════════════════════════════════════════
// V2 HOOK ENGINE — Generate → Score → Filter → Refine
// ═══════════════════════════════════════════════════════════════

async function generateHooksWithV2Engine(channelId: string, topic: string, exploreTopic?: string, contentIntent?: string) {
  // Derive contentMode from explicit contentIntent (set at niche selection time).
  // Falls back to legacy isFactTopic() classifier if contentIntent is not yet set.
  const contentMode: TopicContentMode = contentModeFromIntent(contentIntent, topic, exploreTopic);

  console.log(`[hook-service] Using Hook Engine V2 for topic="${topic}" contentMode=${contentMode} contentIntent=${contentIntent ?? 'null (legacy fallback)'}${exploreTopic ? ` (exploreTopic="${exploreTopic}")` : ''}`);

  // Run the 4-step pipeline with content mode
  const v2Result = await generateHooksV2({ topic, contentMode, count: 20 });

  // Map V2 output to Post-compatible format
  // V2 hooks use the "improved" (refined) text as the final hook
  const hooks = v2Result.hooks.map(h => ({
    text: h.improved, // Use the refined version
    originalText: h.hook,
    type: 'HIDDEN_TRUTH' as const, // V2 doesn't use legacy types; default to HIDDEN_TRUTH
    visualHint: '',
    pattern: undefined as string | undefined,
    v2Scores: h.scores,
  }));

  // ─── Check for existing posts before deletion ──────────────
  const existingPosts = await prisma.post.findMany({
    where: { channelId },
    include: { slides: true, caption: true },
  });

  if (existingPosts.length > 0) {
    const postsWithSlides = existingPosts.filter(p => p.slides.length > 0);
    const postsWithCaptions = existingPosts.filter(p => p.caption !== null);
    if (postsWithSlides.length > 0 || postsWithCaptions.length > 0) {
      console.warn(
        `[hook-service] WARNING: Deleting ${existingPosts.length} existing posts ` +
        `(${postsWithSlides.length} with slides, ${postsWithCaptions.length} with captions). ` +
        `Generated content will be permanently removed.`
      );
    }
  }

  await prisma.post.deleteMany({ where: { channelId } });

  // ─── Create post records from V2 hooks ─────────────────────
  const posts = await Promise.all(
    hooks.map((hook, index) => {
      const words = hook.text.split(/\s+/).filter(Boolean);
      const titleWordCount = Math.min(6, words.length);
      const rawTitle = words.slice(0, titleWordCount).join(' ');
      const title = rawTitle.replace(/[,;:!?.…—\-]+$/, '');

      return prisma.post.create({
        data: {
          channelId,
          dayIndex: index + 1,
          title,
          hook: hook.text,
          visualHint: null,
          pattern: null,
          type: hook.type,
          status: 'DRAFT',
        },
      });
    })
  );

  // ─── Store generation job with V2 pipeline stats ───────────
  await prisma.generationJob.create({
    data: {
      channelId,
      jobType: 'HOOK_GENERATION',
      status: 'COMPLETED',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: {
        engine: 'v2',
        hookCount: hooks.length,
        pipelineStats: v2Result.pipelineStats,
        hooks: v2Result.hooks.map(h => ({
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

  console.log(`[hook-service] V2 pipeline complete: ${posts.length} posts created`);
  return posts;
}

// ═══════════════════════════════════════════════════════════════
// LEGACY PIPELINE — kept for backward compatibility
// Set USE_HOOK_ENGINE_V2=false to use this path
// ═══════════════════════════════════════════════════════════════

async function generateHooksLegacy(channelId: string, topic: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { memory: true },
  });

  if (!channel) {
    throw new Error('Channel not found');
  }

  const positioning = inferContentStyle(channel.niche || channel.name);

  // ─── Step 0: Classify topic ─────────────────────────────────
  const classification = classifyTopic(topic);
  const { mode: groundingMode, reason: routingReason } = classification;

  // Record telemetry
  hookGenerationTelemetry.classifierDecision.push({ topic, mode: groundingMode, reason: routingReason });
  if (hookGenerationTelemetry.classifierDecision.length > 100) {
    hookGenerationTelemetry.classifierDecision.shift(); // ring buffer
  }

  switch (groundingMode) {
    case 'news': hookGenerationTelemetry.modeNews++; break;
    case 'knowledge': hookGenerationTelemetry.modeKnowledge++; break;
    case 'mixed': hookGenerationTelemetry.modeMixed++; break;
  }

  console.log(`[hook-service] Topic="${topic}" → mode: ${groundingMode} | reason: ${routingReason}`);

  // ─── Step 1: Generate hooks via the classified mode ─────────
  let result: HookResult;

  switch (groundingMode) {
    case 'news':
      result = await generateNewsGroundedHooks(topic);
      break;
    case 'knowledge':
      result = await generateKnowledgeGroundedHooksStrict(topic);
      break;
    case 'mixed':
      result = await generateMixedGroundedHooks(topic);
      break;
  }

  let { hooks } = result;
  const { rejectedCount, groundingSource, fallbackUsed } = result;

  // ─── Step 2: Score all hooks ───────────────────────────────
  let scored = scoreAllHooks(hooks);
  const diversity = checkDiversity(hooks);

  const avgVisual = scored.reduce((sum, h) => sum + h.scores.visualPotential, 0) / scored.length;
  const avgScore = scored.reduce((sum, h) => sum + h.scores.average, 0) / scored.length;
  console.log('[hook-service] Initial hook quality:');
  console.log(`  Average score: ${avgScore.toFixed(1)}/10 | Visual potential: ${avgVisual.toFixed(1)}/10`);
  console.log(`  Questions: ${diversity.questionCount}, Declaratives: ${diversity.declarativeCount}, Contrasts: ${diversity.contrastCount}, Scenarios: ${diversity.scenarioCount}`);
  const lowVisualCount = scored.filter(h => h.scores.visualPotential < 6).length;
  if (lowVisualCount > 0) {
    console.log(`  ${lowVisualCount} hooks with low visual potential (<6)`);
  }

  if (diversity.violations.length > 0) {
    console.log('  Diversity violations:');
    diversity.violations.forEach(v => console.log(`    - ${v}`));
  }

  // ─── Step 3: Identify weak hooks and attempt improvement ──
  const weakIndices = getWeakHookIndices(scored, 7, 6);

  if (weakIndices.length > 0) {
    console.log(`[hook-service] ${weakIndices.length} hooks scored below threshold (avg < 7). Running improvement pass...`);

    const weakHooks = weakIndices.map(i => ({
      text: hooks[i].text,
      type: hooks[i].type,
      issues: scored[i].flags,
    }));

    try {
      const improvementPrompt = buildHookImprovementPrompt(weakHooks, {
        niche: channel.niche!,
        positioning: {
          angle: positioning.angle,
          tone: positioning.tone,
        },
      });

      const ai = getAIProvider();
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
      const newAvg = scored.reduce((sum, h) => sum + h.scores.average, 0) / scored.length;
      console.log(`[hook-service] After improvement: avg score ${newAvg.toFixed(1)}/10 (was ${avgScore.toFixed(1)})`);
    } catch (err) {
      console.warn('[hook-service] Hook improvement pass failed, using originals:', err);
    }
  }

  // ─── Step 4: Type distribution check ───────────────────────
  const typeCounts: Record<string, number> = {};
  for (const hook of hooks) {
    typeCounts[hook.type] = (typeCounts[hook.type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(typeCounts)) {
    if (count > 10) {
      console.warn(`[hook-service] Type distribution warning: ${type} has ${count} hooks (>10). Should be more even.`);
    }
  }

  // ─── Step 5: Check for existing posts before deletion ──────
  const existingPosts = await prisma.post.findMany({
    where: { channelId },
    include: { slides: true, caption: true },
  });

  if (existingPosts.length > 0) {
    const postsWithSlides = existingPosts.filter(p => p.slides.length > 0);
    const postsWithCaptions = existingPosts.filter(p => p.caption !== null);
    if (postsWithSlides.length > 0 || postsWithCaptions.length > 0) {
      console.warn(
        `[hook-service] WARNING: Deleting ${existingPosts.length} existing posts ` +
        `(${postsWithSlides.length} with slides, ${postsWithCaptions.length} with captions). ` +
        `Generated content will be permanently removed.`
      );
    }
  }

  await prisma.post.deleteMany({ where: { channelId } });

  // ─── Step 6: Create post records ───────────────────────────
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

  // ─── Step 7: Store generation job with quality report ──────
  await prisma.generationJob.create({
    data: {
      channelId,
      jobType: 'HOOK_GENERATION',
      status: 'COMPLETED',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: {
        engine: 'legacy',
        hookCount: hooks.length,
        averageScore: scored.reduce((sum, h) => sum + h.scores.average, 0) / scored.length,
        weakHooksImproved: weakIndices.length,
        typeCounts,
        diversityViolations: diversity.violations,
        groundingMode,
        routingReason,
        groundingSource,
        fallbackUsed,
        hooksRejectedByFilter: rejectedCount,
      } as any,
    },
  });

  await prisma.channel.update({
    where: { id: channelId },
    data: { status: 'HOOKS_GENERATED' },
  });

  return posts;
}

// ═══════════════════════════════════════════════════════════════
// MODE: NEWS — strict news-only fallback
// ═══════════════════════════════════════════════════════════════

async function generateNewsGroundedHooks(topic: string): Promise<HookResult> {
  let externalEvents: TopicEvent[] | undefined;
  let groundingSource: GroundingSource = 'news_external';
  let fallbackUsed = false;

  try {
    console.log('[hook-service] Task: fetch_recent_topic_events');
    externalEvents = await fetchTopicEvents(topic, 10);

    if (externalEvents.length > 0) {
      hookGenerationTelemetry.externalFetchSuccess++;
      console.log(`[hook-service] Telemetry: external_fetch_success (total: ${hookGenerationTelemetry.externalFetchSuccess}) | ${externalEvents.length} events`);
    } else {
      throw new Error('NewsAPI returned 0 articles');
    }
  } catch (err) {
    hookGenerationTelemetry.externalFetchFailure++;
    console.warn(`[hook-service] Telemetry: external_fetch_failure (total: ${hookGenerationTelemetry.externalFetchFailure}) | ${err instanceof Error ? err.message : err}`);

    if (!isInternalFallbackAllowed()) {
      throw new Error(
        `[hook-service] News fetch failed and ALLOW_INTERNAL_HOOK_FALLBACK=false. ` +
        `Cannot generate news-grounded hooks. Error: ${err instanceof Error ? err.message : err}`
      );
    }

    // STRICT: fall back to internal NEWS-grounded generation, NOT to knowledge mode
    hookGenerationTelemetry.internalFallback++;
    groundingSource = 'news_internal_fallback';
    fallbackUsed = true;
    externalEvents = undefined;
    console.warn(`[hook-service] Telemetry: internal_fallback (total: ${hookGenerationTelemetry.internalFallback}) | news-mode internal-knowledge fallback (NOT cross-mode)`);
  }

  console.log(`[hook-service] Task: generate_reality_grounded_hooks_from_${groundingSource}`);
  const prompt = buildRealityGroundedHooksPrompt(topic, 30, externalEvents);

  const ai = getAIProvider();
  const { data: generated } = await ai.generateObject(prompt, RealityGroundedHooks);

  const filteredHooks = filterRealityGroundedHooks(generated.hooks);
  const rejectedCount = generated.hooks.length - filteredHooks.length;
  hookGenerationTelemetry.hooksRejectedByFilter += rejectedCount;
  console.log(`[hook-service] Telemetry: hooks_rejected_by_filter=${rejectedCount} (total: ${hookGenerationTelemetry.hooksRejectedByFilter})`);

  const hooks = filteredHooks.map(hook => ({
    text: hook.text,
    type: mapAngleToType(hook.angle),
    visualHint: hook.event_summary,
    pattern: undefined as string | undefined,
  }));

  return { hooks, rejectedCount, groundingSource, fallbackUsed };
}

// ═══════════════════════════════════════════════════════════════
// MODE: KNOWLEDGE — strict knowledge-only fallback
// ═══════════════════════════════════════════════════════════════

async function generateKnowledgeGroundedHooksStrict(topic: string): Promise<HookResult> {
  let knowledge: TopicKnowledge | undefined;
  let groundingSource: GroundingSource = 'knowledge_external';
  let fallbackUsed = false;

  try {
    console.log('[hook-service] Task: fetch_topic_knowledge');
    knowledge = await fetchTopicKnowledge(topic, 15);
    hookGenerationTelemetry.knowledgeFetchSuccess++;
    console.log(`[hook-service] Telemetry: knowledge_fetch_success (total: ${hookGenerationTelemetry.knowledgeFetchSuccess}) | ${knowledge.facts.length} facts`);
  } catch (err) {
    hookGenerationTelemetry.knowledgeFetchFailure++;
    console.warn(`[hook-service] Telemetry: knowledge_fetch_failure (total: ${hookGenerationTelemetry.knowledgeFetchFailure}) | ${err instanceof Error ? err.message : err}`);

    // STRICT: do NOT cross into news mode. Fall back to internal knowledge-grounded only.
    hookGenerationTelemetry.crossModeFallbackPrevented++;
    console.warn(`[hook-service] Telemetry: cross_mode_fallback_PREVENTED (total: ${hookGenerationTelemetry.crossModeFallbackPrevented}) | would have fallen to news, staying in knowledge mode`);

    if (!isInternalFallbackAllowed()) {
      throw new Error(
        `[hook-service] Knowledge fetch failed and ALLOW_INTERNAL_HOOK_FALLBACK=false. ` +
        `Cannot generate knowledge-grounded hooks. Error: ${err instanceof Error ? err.message : err}`
      );
    }

    hookGenerationTelemetry.internalFallback++;
    groundingSource = 'knowledge_internal_fallback';
    fallbackUsed = true;
    console.warn(`[hook-service] Telemetry: internal_fallback (total: ${hookGenerationTelemetry.internalFallback}) | knowledge-mode internal-knowledge fallback (NOT cross-mode)`);
  }

  if (knowledge) {
    // External knowledge path
    console.log('[hook-service] Task: generate_knowledge_grounded_hooks');
    const prompt = buildKnowledgeGroundedHooksPrompt(topic, knowledge.facts, 30);
    const ai = getAIProvider();
    const { data: generated } = await ai.generateObject(prompt, KnowledgeGroundedHooks);

    const filteredHooks = filterKnowledgeGroundedHooks(generated.hooks, knowledge.facts);
    const rejectedCount = generated.hooks.length - filteredHooks.length;
    hookGenerationTelemetry.hooksRejectedByFilter += rejectedCount;
    console.log(`[hook-service] Telemetry: hooks_rejected_by_filter=${rejectedCount} (total: ${hookGenerationTelemetry.hooksRejectedByFilter})`);

    const hooks = filteredHooks.map(hook => ({
      text: hook.text,
      type: mapAngleToType(hook.angle),
      visualHint: `[${knowledge!.source}] ${hook.fact_refs.join(', ')}`,
      pattern: undefined as string | undefined,
    }));

    return { hooks, rejectedCount, groundingSource, fallbackUsed };
  }

  // Internal knowledge fallback: use reality-grounded prompt without external events
  // but stay in the "knowledge" framing (no news events injected)
  console.log('[hook-service] Task: generate_knowledge_grounded_hooks_internal_fallback');
  const prompt = buildRealityGroundedHooksPrompt(topic, 30, undefined);
  const ai = getAIProvider();
  const { data: generated } = await ai.generateObject(prompt, RealityGroundedHooks);

  const filteredHooks = filterRealityGroundedHooks(generated.hooks);
  const rejectedCount = generated.hooks.length - filteredHooks.length;
  hookGenerationTelemetry.hooksRejectedByFilter += rejectedCount;

  const hooks = filteredHooks.map(hook => ({
    text: hook.text,
    type: mapAngleToType(hook.angle),
    visualHint: hook.event_summary,
    pattern: undefined as string | undefined,
  }));

  return { hooks, rejectedCount, groundingSource, fallbackUsed };
}

// ═══════════════════════════════════════════════════════════════
// MODE: MIXED — knowledge primary, news enrichment optional
// ═══════════════════════════════════════════════════════════════

async function generateMixedGroundedHooks(topic: string): Promise<HookResult> {
  let knowledge: TopicKnowledge | undefined;
  let externalEvents: TopicEvent[] | undefined;
  let groundingSource: GroundingSource = 'mixed_knowledge_and_news';
  let fallbackUsed = false;

  // ─── Phase A: Fetch knowledge (primary) ─────────────────────
  try {
    console.log('[hook-service] Task: fetch_topic_knowledge (mixed-mode primary)');
    knowledge = await fetchTopicKnowledge(topic, 15);
    hookGenerationTelemetry.knowledgeFetchSuccess++;
    console.log(`[hook-service] Mixed: knowledge OK — ${knowledge.facts.length} facts`);
  } catch (err) {
    hookGenerationTelemetry.knowledgeFetchFailure++;
    console.warn(`[hook-service] Mixed: knowledge fetch failed — ${err instanceof Error ? err.message : err}`);
  }

  // ─── Phase B: Fetch news (enrichment, non-blocking) ─────────
  try {
    console.log('[hook-service] Task: fetch_recent_topic_events (mixed-mode enrichment)');
    externalEvents = await fetchTopicEvents(topic, 10);
    if (externalEvents.length > 0) {
      hookGenerationTelemetry.externalFetchSuccess++;
      console.log(`[hook-service] Mixed: news OK — ${externalEvents.length} events`);
    } else {
      externalEvents = undefined;
    }
  } catch (err) {
    hookGenerationTelemetry.externalFetchFailure++;
    console.warn(`[hook-service] Mixed: news fetch failed — ${err instanceof Error ? err.message : err}`);
    externalEvents = undefined;
  }

  // ─── Decide generation strategy ────────────────────────────
  const hasKnowledge = knowledge && knowledge.facts.length >= 3;
  const hasNews = externalEvents && externalEvents.length > 0;

  if (hasKnowledge && hasNews) {
    // Best case: both sources available
    groundingSource = 'mixed_knowledge_and_news';
    console.log('[hook-service] Mixed: using BOTH knowledge + news enrichment');
  } else if (hasKnowledge && !hasNews) {
    groundingSource = 'mixed_knowledge_only';
    console.log('[hook-service] Mixed: using knowledge only (news unavailable)');
  } else if (!hasKnowledge && hasNews) {
    groundingSource = 'mixed_news_only';
    console.log('[hook-service] Mixed: using news only (knowledge unavailable)');
  } else {
    // Neither source available
    if (!isInternalFallbackAllowed()) {
      throw new Error(
        '[hook-service] Mixed mode: both knowledge and news fetch failed, and ALLOW_INTERNAL_HOOK_FALLBACK=false.'
      );
    }
    hookGenerationTelemetry.internalFallback++;
    groundingSource = 'knowledge_internal_fallback';
    fallbackUsed = true;
    console.warn('[hook-service] Mixed: both sources failed, using internal knowledge fallback');
  }

  const ai = getAIProvider();
  let allHooks: Array<{
    text: string;
    type: 'CONTRARIAN' | 'CALL_OUT' | 'MISTAKE_EXPOSURE' | 'HIDDEN_TRUTH';
    visualHint: string;
    pattern: string | undefined;
  }> = [];
  let totalRejected = 0;

  // ─── Generate from knowledge if available ───────────────────
  if (hasKnowledge) {
    const knowledgePrompt = buildKnowledgeGroundedHooksPrompt(topic, knowledge!.facts, 20);
    const { data: knowledgeGenerated } = await ai.generateObject(knowledgePrompt, KnowledgeGroundedHooks);
    const knowledgeFiltered = filterKnowledgeGroundedHooks(knowledgeGenerated.hooks, knowledge!.facts);
    totalRejected += knowledgeGenerated.hooks.length - knowledgeFiltered.length;

    allHooks.push(...knowledgeFiltered.map(hook => ({
      text: hook.text,
      type: mapAngleToType(hook.angle),
      visualHint: `[${knowledge!.source}] ${hook.fact_refs.join(', ')}`,
      pattern: undefined as string | undefined,
    })));
  }

  // ─── Generate from news if available ────────────────────────
  if (hasNews) {
    const newsPrompt = buildRealityGroundedHooksPrompt(topic, 15, externalEvents);
    const { data: newsGenerated } = await ai.generateObject(newsPrompt, RealityGroundedHooks);
    const newsFiltered = filterRealityGroundedHooks(newsGenerated.hooks);
    totalRejected += newsGenerated.hooks.length - newsFiltered.length;

    allHooks.push(...newsFiltered.map(hook => ({
      text: hook.text,
      type: mapAngleToType(hook.angle),
      visualHint: hook.event_summary,
      pattern: undefined as string | undefined,
    })));
  }

  // ─── Internal fallback if neither source worked ─────────────
  if (allHooks.length === 0) {
    const fallbackPrompt = buildRealityGroundedHooksPrompt(topic, 30, undefined);
    const { data: fallbackGenerated } = await ai.generateObject(fallbackPrompt, RealityGroundedHooks);
    const fallbackFiltered = filterRealityGroundedHooks(fallbackGenerated.hooks);
    totalRejected += fallbackGenerated.hooks.length - fallbackFiltered.length;

    allHooks = fallbackFiltered.map(hook => ({
      text: hook.text,
      type: mapAngleToType(hook.angle),
      visualHint: hook.event_summary,
      pattern: undefined as string | undefined,
    }));
  }

  // Deduplicate by text (knowledge and news may produce overlapping hooks)
  const seen = new Set<string>();
  const deduped = allHooks.filter(hook => {
    const key = hook.text.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  hookGenerationTelemetry.hooksRejectedByFilter += totalRejected;
  console.log(`[hook-service] Mixed: ${deduped.length} unique hooks (${totalRejected} rejected by filter)`);

  return { hooks: deduped, rejectedCount: totalRejected, groundingSource, fallbackUsed };
}
