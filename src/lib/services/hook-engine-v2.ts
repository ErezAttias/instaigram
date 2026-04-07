/**
 * Hook Engine V2 — 6-step pipeline:
 *   Generate → Pre-filter → LLM Validate → Score → Filter → Refine (+ post-refine validate)
 *
 * Fact-mode hooks pass through three validation layers:
 *   1. Deterministic pre-filter (regex: news patterns, named people, orgs)
 *   2. LLM Fact-Hook Validator (source of truth: accept/reject/borderline)
 *   3. Post-refinement LLM re-validation (catches regressions)
 *
 * INVARIANT: A hook with verdict === "reject" can NEVER reach the UI.
 * If the LLM validator doesn't explicitly accept a hook, it defaults to reject.
 */

import { getAIProvider } from '@/lib/ai/provider';
import {
  buildHookGenerationV2Prompt,
  buildHookScoringV2Prompt,
  buildHookRefinementV2Prompt,
  buildFactHookValidatorPrompt,
  type HookEngineV2Params,
} from '@/lib/prompts/hook-engine-v2';
import {
  GeneratedHooksV2,
  ScoredHooksV2,
  RefinedHooksV2,
  ValidatedFactHooks,
  type HookEngineV2Output,
  type HookV2Scores,
  type ValidatedFactHook,
} from '@/lib/validation/schemas';
import type { TopicContentMode } from '@/lib/utils/topic-classifier';
import { isEvergreenFact } from '@/lib/utils/evergreen-fact-validator';

// ─── Pipeline Config ─────────────────────────────────────────

export const MIN_TOTAL_SCORE = 15;
export const MIN_CURIOSITY_GAP = 3;
export const TOP_HOOKS_COUNT = 8;
const GENERATE_COUNT = 20;

// ─── Fuzzy text matching ─────────────────────────────────────
// The LLM validator may return hook text with minor differences
// (trailing punctuation, casing, whitespace). We normalize before
// comparing to prevent mismatches from silently re-admitting
// rejected hooks.

export function normalizeHookText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.!?;:]+$/, '')   // strip trailing punctuation
    .replace(/\s+/g, ' ')       // normalize whitespace
    .replace(/[""'']/g, '"');    // normalize quotes
}

/**
 * Build a lookup map from LLM validation results that uses
 * normalized text for matching. Returns null for hooks the LLM
 * didn't return a result for.
 */
function buildValidationLookup(
  validations: ValidatedFactHook[]
): Map<string, ValidatedFactHook> {
  const map = new Map<string, ValidatedFactHook>();
  for (const v of validations) {
    map.set(normalizeHookText(v.hook), v);
  }
  return map;
}

function lookupValidation(
  hook: string,
  map: Map<string, ValidatedFactHook>
): ValidatedFactHook | null {
  return map.get(normalizeHookText(hook)) ?? null;
}

// ─── Deterministic pre-filter (fast, catches obvious violations) ─

const NEWS_HOOK_PATTERNS: RegExp[] = [
  /\b(born|birth|baby|newborn|hatched)\b/i,
  /\b(return(s|ed|ing)?\s+to|reintroduc(ed|tion|ing)|reappear(s|ed|ing)?|come(s)?\s+back|comeback|makes?\s+a\s+return)\b/i,
  /\b(spotted\s+(in|at|near)|sighted\s+(in|at|near)|found\s+(in|at|near)|seen\s+(in|at|near))\b/i,
  /\b(latest|recent(ly)?|just\s+(discovered|found|revealed|announced)|breaking|update|trending)\b/i,
  /\b(this\s+(year|month|week)|last\s+(year|month|week)|in\s+20\d{2}|20\d{2})\b/i,
  /\b(for\s+the\s+first\s+time\s+in|after\s+\d+\s+years|since\s+\d{4})\b/i,
  /\b(new\s+study|new\s+research|scientists?\s+(just|recently|now)|researchers?\s+(just|recently|announce))\b/i,
  /\b(officials?\s+say|experts?\s+warn|report\s+shows|according\s+to\s+a\s+(new|recent))\b/i,
  /\b(makes?\s+headlines?|goes?\s+viral|sparks?\s+(debate|controversy|outrage))\b/i,
  /\b(arrives?\s+in|relocated\s+to|moved\s+to|transferred\s+to|brought\s+to)\b/i,
  /\b(zoo|sanctuary|wildlife\s+center|conservation\s+program|breeding\s+program)\b/i,
];

export function detectNewsFraming(hookText: string): string | null {
  for (const pattern of NEWS_HOOK_PATTERNS) {
    const match = hookText.match(pattern);
    if (match) return match[0];
  }
  return null;
}

interface PreFilterResult {
  passed: string[];
  rejected: Array<{ hook: string; reason: string }>;
}

export function preFilterFactHooks(hooks: string[], contentMode: TopicContentMode): PreFilterResult {
  if (contentMode !== 'fact') {
    return { passed: hooks, rejected: [] };
  }

  const passed: string[] = [];
  const rejected: Array<{ hook: string; reason: string }> = [];

  for (const hook of hooks) {
    const newsMatch = detectNewsFraming(hook);
    if (newsMatch) {
      rejected.push({ hook, reason: `news_pattern: "${newsMatch}"` });
      continue;
    }
    const ev = isEvergreenFact(hook);
    if (!ev.valid) {
      rejected.push({ hook, reason: ev.reason });
      continue;
    }
    passed.push(hook);
  }

  return { passed, rejected };
}

// ─── LLM Validator ──────────────────────────────────────────

export interface LLMValidationResult {
  accepted: string[];
  borderline: string[];
  rejected: Array<{ hook: string; verdict: string; reason: string; explanation: string }>;
  validations: ValidatedFactHook[];
}

/**
 * LLM Fact-Hook Validator — the source of truth.
 *
 * CRITICAL FIX: If the LLM does not return a validation for a hook
 * (text mismatch, omission, etc.), that hook defaults to REJECT,
 * not borderline. The validator must explicitly accept a hook
 * for it to proceed.
 */
export async function llmValidateFactHooks(
  hooks: string[],
  contentMode: TopicContentMode,
): Promise<LLMValidationResult> {
  if (contentMode !== 'fact' || hooks.length === 0) {
    return { accepted: hooks, borderline: [], rejected: [], validations: [] };
  }

  const ai = getAIProvider();
  const prompt = buildFactHookValidatorPrompt(hooks);
  const { data: result } = await ai.generateObject(prompt, ValidatedFactHooks);

  // Use normalized text matching to handle minor LLM text differences
  const validationLookup = buildValidationLookup(result.hooks);

  const accepted: string[] = [];
  const borderline: string[] = [];
  const rejected: Array<{ hook: string; verdict: string; reason: string; explanation: string }> = [];

  for (const hook of hooks) {
    const v = lookupValidation(hook, validationLookup);

    if (!v) {
      // LLM didn't return a validation for this hook.
      // DEFAULT: REJECT. The validator must explicitly accept.
      rejected.push({
        hook,
        verdict: 'reject',
        reason: 'validator_missing',
        explanation: 'LLM validator did not return a result for this hook — defaulting to reject',
      });
      console.log(`[hook-engine-v2] VALIDATOR-MISS: "${hook}" — no LLM result, defaulting to REJECT`);
      continue;
    }

    switch (v.verdict) {
      case 'accept':
        accepted.push(hook);
        break;
      case 'borderline':
        borderline.push(hook);
        break;
      case 'reject':
        rejected.push({
          hook,
          verdict: v.verdict,
          reason: v.failReason ?? 'unknown',
          explanation: v.explanation,
        });
        break;
    }
  }

  return { accepted, borderline, rejected, validations: result.hooks };
}

// ─── Types ───────────────────────────────────────────────────

export interface HookEngineV2Result {
  hooks: HookEngineV2Output[];
  pipelineStats: {
    generated: number;
    preFilterRejected: number;
    llmValidatorAccepted: number;
    llmValidatorBorderline: number;
    llmValidatorRejected: number;
    scoredAboveThreshold: number;
    filteredTop: number;
    refined: number;
    postRefineReverted: number;
    contentMode: TopicContentMode;
  };
}

// ─── Main entry point ────────────────────────────────────────

export async function generateHooksV2(
  params: HookEngineV2Params
): Promise<HookEngineV2Result> {
  const ai = getAIProvider();
  const { topic, contentMode } = params;
  const count = params.count ?? GENERATE_COUNT;

  // Track ALL rejected hook texts across the pipeline.
  // Once a hook is in this set, it can NEVER re-enter.
  const permanentlyRejected = new Set<string>();

  console.log(`[hook-engine-v2] ══════════════════════════════════════════`);
  console.log(`[hook-engine-v2] Pipeline start: topic="${topic}" contentMode=${contentMode}`);
  console.log(`[hook-engine-v2] ══════════════════════════════════════════`);

  // ─── STEP 1: Generate structured hooks ─────────────────────
  console.log(`[hook-engine-v2] Step 1/6: GENERATE (${count} hooks)...`);
  const generatePrompt = buildHookGenerationV2Prompt({ topic, contentMode, count });
  const { data: generated } = await ai.generateObject(generatePrompt, GeneratedHooksV2);

  const rawHooks = generated.hooks.map(h => h.hook);
  console.log(`[hook-engine-v2] Generated ${rawHooks.length} hooks:`);
  for (let i = 0; i < rawHooks.length; i++) {
    console.log(`  [GEN ${i + 1}] "${rawHooks[i]}"`);
  }

  // ─── STEP 2: Deterministic pre-filter ──────────────────────
  console.log(`[hook-engine-v2] Step 2/6: PRE-FILTER...`);
  const { passed: preFiltered, rejected: preRejected } = preFilterFactHooks(rawHooks, contentMode);

  for (const r of preRejected) {
    permanentlyRejected.add(normalizeHookText(r.hook));
    console.log(`  [PRE-REJECT] "${r.hook}" — ${r.reason}`);
  }
  console.log(`[hook-engine-v2] Pre-filter: ${preFiltered.length} passed, ${preRejected.length} rejected`);

  // ─── STEP 3: LLM Fact-Hook Validator ───────────────────────
  console.log(`[hook-engine-v2] Step 3/6: LLM VALIDATE...`);
  const llmResult = await llmValidateFactHooks(preFiltered, contentMode);

  for (const r of llmResult.rejected) {
    permanentlyRejected.add(normalizeHookText(r.hook));
    console.log(`  [LLM-REJECT] "${r.hook}" — ${r.reason}: ${r.explanation}`);
  }
  for (const h of llmResult.borderline) {
    console.log(`  [LLM-BORDER] "${h}"`);
  }
  for (const h of llmResult.accepted) {
    console.log(`  [LLM-ACCEPT] "${h}"`);
  }
  console.log(`[hook-engine-v2] LLM Validator: ${llmResult.accepted.length} accepted, ${llmResult.borderline.length} borderline, ${llmResult.rejected.length} rejected`);

  // Only accepted hooks proceed. Borderline can backfill.
  // Rejected hooks are in permanentlyRejected — they can never return.
  const primaryHooks = llmResult.accepted;
  const borderlinePool = llmResult.borderline;

  // Safety: verify no rejected hook is in accepted or borderline
  const leakedRejected = [...primaryHooks, ...borderlinePool].filter(
    h => permanentlyRejected.has(normalizeHookText(h))
  );
  if (leakedRejected.length > 0) {
    console.error(`[hook-engine-v2] BUG DETECTED: ${leakedRejected.length} rejected hooks leaked into accepted/borderline pool!`);
    for (const h of leakedRejected) {
      console.error(`  LEAKED: "${h}"`);
    }
  }

  // Build the hook pool for scoring: accepted first, then borderline
  const scoringPool = [
    ...primaryHooks.filter(h => !permanentlyRejected.has(normalizeHookText(h))),
    ...borderlinePool.filter(h => !permanentlyRejected.has(normalizeHookText(h))),
  ];

  if (scoringPool.length === 0) {
    console.error('[hook-engine-v2] All hooks rejected. Returning empty result.');
    return emptyResult(rawHooks.length, preRejected.length, llmResult, contentMode);
  }

  // ─── STEP 4: Score ─────────────────────────────────────────
  console.log(`[hook-engine-v2] Step 4/6: SCORE (${scoringPool.length} hooks)...`);
  console.log(`[hook-engine-v2] Hooks entering scoring:`);
  for (const h of scoringPool) {
    console.log(`  [SCORE-IN] "${h}"`);
  }

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
  console.log(`[hook-engine-v2] ${aboveThreshold.length}/${scoredHooks.length} passed score threshold`);

  // ─── STEP 5: Filter top N ─────────────────────────────────
  console.log(`[hook-engine-v2] Step 5/6: FILTER top ${TOP_HOOKS_COUNT}...`);
  const acceptedSet = new Set(primaryHooks.map(h => normalizeHookText(h)));

  // Sort: accepted above-threshold first, then borderline above-threshold
  const sortedAccepted = aboveThreshold
    .filter(h => acceptedSet.has(normalizeHookText(h.hook)))
    .sort((a, b) => b.scores.totalScore - a.scores.totalScore);
  const sortedBorderline = aboveThreshold
    .filter(h => !acceptedSet.has(normalizeHookText(h.hook)))
    .sort((a, b) => b.scores.totalScore - a.scores.totalScore);

  const topHooks = sortedAccepted.slice(0, TOP_HOOKS_COUNT);

  // Backfill with borderline ONLY if we don't have enough accepted
  if (topHooks.length < TOP_HOOKS_COUNT) {
    const backfillNeeded = TOP_HOOKS_COUNT - topHooks.length;
    const backfilled = sortedBorderline.slice(0, backfillNeeded);
    topHooks.push(...backfilled);
    if (backfilled.length > 0) {
      console.log(`[hook-engine-v2] Backfilled ${backfilled.length} borderline hooks`);
    }
  }

  // Last resort: below-threshold accepted hooks
  if (topHooks.length < TOP_HOOKS_COUNT) {
    const belowThreshold = scoredHooks
      .filter(h => acceptedSet.has(normalizeHookText(h.hook)) && !topHooks.some(t => t.hook === h.hook))
      .sort((a, b) => b.scores.totalScore - a.scores.totalScore);
    const needed = TOP_HOOKS_COUNT - topHooks.length;
    topHooks.push(...belowThreshold.slice(0, needed));
  }

  // FINAL SAFETY: ensure no permanently rejected hook made it through
  const cleanTopHooks = topHooks.filter(h => {
    if (permanentlyRejected.has(normalizeHookText(h.hook))) {
      console.error(`[hook-engine-v2] BLOCKED rejected hook from final output: "${h.hook}"`);
      return false;
    }
    return true;
  });

  console.log(`[hook-engine-v2] ${cleanTopHooks.length} hooks selected for refinement:`);
  for (const h of cleanTopHooks) {
    console.log(`  [TOP] "${h.hook}" (score: ${h.scores.totalScore})`);
  }

  if (cleanTopHooks.length === 0) {
    return emptyResult(rawHooks.length, preRejected.length, llmResult, contentMode);
  }

  // ─── STEP 6: Refine ───────────────────────────────────────
  console.log(`[hook-engine-v2] Step 6/6: REFINE...`);
  const topTexts = cleanTopHooks.map(h => h.hook);
  const refinePrompt = buildHookRefinementV2Prompt(topTexts, contentMode);
  const { data: refined } = await ai.generateObject(refinePrompt, RefinedHooksV2);

  const refinementMap = new Map<string, string>();
  for (const item of refined.hooks) {
    refinementMap.set(normalizeHookText(item.original), item.improved);
  }

  // ─── Post-refine LLM re-validation ─────────────────────────
  let postRefineReverted = 0;

  if (contentMode === 'fact') {
    const refinedTexts = cleanTopHooks.map(h =>
      refinementMap.get(normalizeHookText(h.hook)) ?? h.hook
    );

    console.log('[hook-engine-v2] Post-refine LLM validation...');
    const postResult = await llmValidateFactHooks(refinedTexts, contentMode);
    const postRejectedSet = new Set(postResult.rejected.map(r => normalizeHookText(r.hook)));

    for (const r of postResult.rejected) {
      console.log(`  [POST-REJECT] "${r.hook}" — ${r.reason}: ${r.explanation}`);
    }

    // Revert rejected refined hooks to their originals
    for (const h of cleanTopHooks) {
      const refinedText = refinementMap.get(normalizeHookText(h.hook)) ?? h.hook;
      if (postRejectedSet.has(normalizeHookText(refinedText))) {
        console.log(`  [POST-REVERT] "${refinedText}" → reverting to "${h.hook}"`);
        refinementMap.set(normalizeHookText(h.hook), h.hook);
        postRefineReverted++;
      }
    }
  }

  // ─── Assemble final output ─────────────────────────────────
  const finalHooks: HookEngineV2Output[] = cleanTopHooks.map(h => ({
    hook: h.hook,
    scores: h.scores,
    improved: refinementMap.get(normalizeHookText(h.hook)) ?? h.hook,
  }));

  // ABSOLUTE FINAL SAFETY: one more check that nothing rejected leaked
  const trulyFinal = finalHooks.filter(h => {
    const rejected =
      permanentlyRejected.has(normalizeHookText(h.hook)) ||
      permanentlyRejected.has(normalizeHookText(h.improved));
    if (rejected) {
      console.error(`[hook-engine-v2] FINAL BLOCK: rejected hook in output: "${h.improved}"`);
    }
    return !rejected;
  });

  const stats = {
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

  console.log(`[hook-engine-v2] ══════════════════════════════════════════`);
  console.log(`[hook-engine-v2] Pipeline complete. Final hooks: ${trulyFinal.length}`);
  console.log(`[hook-engine-v2] Stats:`, JSON.stringify(stats));
  console.log(`[hook-engine-v2] FINAL HOOKS SENT TO UI:`);
  for (let i = 0; i < trulyFinal.length; i++) {
    console.log(`  [FINAL ${i + 1}] "${trulyFinal[i].improved}"`);
  }
  console.log(`[hook-engine-v2] ══════════════════════════════════════════`);

  return { hooks: trulyFinal, pipelineStats: stats };
}

// ─── Helpers ─────────────────────────────────────────────────

function emptyResult(
  generated: number,
  preFilterRejected: number,
  llmResult: LLMValidationResult,
  contentMode: TopicContentMode,
): HookEngineV2Result {
  return {
    hooks: [],
    pipelineStats: {
      generated,
      preFilterRejected,
      llmValidatorAccepted: llmResult.accepted.length,
      llmValidatorBorderline: llmResult.borderline.length,
      llmValidatorRejected: llmResult.rejected.length,
      scoredAboveThreshold: 0,
      filteredTop: 0,
      refined: 0,
      postRefineReverted: 0,
      contentMode,
    },
  };
}
