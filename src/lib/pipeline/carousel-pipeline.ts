import type { AIProvider } from '@/lib/ai/types';
import type { GeneratedCarousel, GeneratedSlideV2, MinedFact, ExpandedFact, PatchedSlide, CarouselMode, CompressedSlideDisplay } from '@/lib/validation/schemas';
import { GeneratedCarousel as GeneratedCarouselSchema, PatchResponse } from '@/lib/validation/schemas';
import { selectConcept } from './steps/concept';
import { mineFacts } from './steps/mine';
import { dedupeFacts } from './steps/dedupe';
import { curateFacts } from './steps/curate-facts';
import { expandFacts } from './steps/expand';
import { broadenConcept } from './steps/broaden';
import { compressSlides } from './steps/compress';
import { buildComposePrompt } from './prompts/compose-prompt';
import { buildPatchPrompt } from './prompts/patch-prompt';
import { validateCarousel, getFailingSlidesWithReasons } from './steps/validate';
import type { CarouselValidationReport } from './steps/validate';
import { classifyDomainStyle } from '@/lib/utils/topic-classifier';

// ─── Retry Constants ────────────────────────────────────────

const MIN_FACTS_REQUIRED = 3;
const MIN_FACTS_HARD_FALLBACK = 2;
const DEFAULT_CANDIDATE_COUNT = 18;
const EXPANDED_CANDIDATE_COUNT = 30;

interface RetryLog {
  reason: 'insufficient_facts';
  attempt: 1 | 2;
  originalConcept: string;
  newConcept: string;
  candidateCount: number;
  finalFactCount: number;
}

// ─── Fallback Types ─────────────────────────────────────────

type FallbackLevel =
  | 'none'
  | 'skip_evaluation'
  | 'skip_compression'
  | 'replace_implication'
  | 'safe_minimal';

interface FallbackMeta {
  level: FallbackLevel;
  reason: string;
  stageErrors: Array<{ stage: string; error: string }>;
}

// ─── Pipeline Input / Output ────────────────────────────────

export interface PipelineParams {
  topic: string;
  hook: {
    text: string;
    type: string;
  };
  knowledgeFacts?: Array<{ id: string; text: string; entities: string[] }>;
  memory?: {
    tone?: string;
    aggressionLevel?: number;
    style?: string;
    avoidPatterns?: string[];
    forbiddenWords?: string[];
  };
  channelNiche?: string;
  channelName?: string;
  pattern?: string;
  /** Pre-selected mode. If absent, the concept step decides. */
  mode?: CarouselMode;
  /** Pre-selected concept (entity or theme). If absent, the concept step decides. */
  concept?: string;
  /** Concepts already used by other posts in this channel (for dedup). */
  usedConcepts?: string[];
  /** User-supplied direction (e.g. "Focus on the chemistry"). Passed to concept step to constrain narrowing. */
  direction?: string;
}

export interface PipelineResult {
  /** The final carousel, possibly patched. */
  carousel: GeneratedCarousel;
  /** Validation report from the last validation pass. */
  validation: CarouselValidationReport;
  /** True if the carousel still has hard failures after patching. */
  qualityWarning: boolean;
  /** Indices of slides that were patched (empty if no patch was needed). */
  patchedSlideIndices: number[];
  /** The selected facts used to compose the carousel (for traceability). */
  selectedFacts: MinedFact[];
  /** The expanded facts with rich explanations (used as slide body source). */
  expandedFacts: ExpandedFact[];
  /** Compressed display text for each slide (short, scannable). */
  compressedSlides: CompressedSlideDisplay[];
  /** The carousel mode that was selected. */
  mode: CarouselMode;
  /** The specific concept (entity or theme) this carousel was built around. */
  concept: string;
  /** Debug metadata about fallback triggers (present when fallback was used). */
  fallback?: FallbackMeta;
}

// ─── Safe Minimal Post (Level 5 fallback) ───────────────────

/**
 * Generate a minimal safe carousel that is guaranteed to render.
 * Used as the last-resort fallback when all pipeline stages fail.
 * Structure: OPENER + 3 FACTs + IMPLICATION + CTA = 6 slides.
 */
function buildSafeMinimalCarousel(topic: string, hook: string): GeneratedCarousel {
  const safeTopic = topic || 'this topic';
  const safeHook = hook || 'Did you know?';

  return {
    title: `Key facts about ${safeTopic}`.slice(0, 60),
    topicConfidence: 3,
    slides: [
      {
        slideNumber: 0,
        role: 'OPENER',
        headline: safeHook.length >= 20 ? safeHook.slice(0, 100) : `Here's what most people miss about ${safeTopic}`.slice(0, 100),
        body: `Most people overlook the fundamental facts about ${safeTopic}. Let's change that.`,
        supportingDetail: null,
        factType: null,
        containsNumber: false,
        concretenessScore: 2,
        noveltyScore: 2,
        topicEntity: safeTopic,
        factRefs: [],
      },
      {
        slideNumber: 1,
        role: 'FACT',
        headline: `The core reality of ${safeTopic} that few discuss`.slice(0, 100),
        body: `${safeTopic} has aspects that are widely misunderstood. The surface-level understanding that most people carry misses critical details that change the entire picture. When you look deeper, the conventional wisdom starts to crack.`.slice(0, 400),
        supportingDetail: null,
        factType: 'mechanism',
        containsNumber: false,
        concretenessScore: 2,
        noveltyScore: 2,
        topicEntity: safeTopic,
        factRefs: [],
      },
      {
        slideNumber: 2,
        role: 'FACT',
        headline: `What the data actually shows about ${safeTopic}`.slice(0, 100),
        body: `The numbers behind ${safeTopic} tell a very different story from what you'd expect. Research consistently points to patterns that contradict popular belief. This isn't speculation — it's what the evidence reveals when you actually look at it.`.slice(0, 400),
        supportingDetail: null,
        factType: 'statistic',
        containsNumber: false,
        concretenessScore: 2,
        noveltyScore: 2,
        topicEntity: safeTopic,
        factRefs: [],
      },
      {
        slideNumber: 3,
        role: 'FACT',
        headline: `The hidden pattern behind ${safeTopic} explained`.slice(0, 100),
        body: `There's a pattern in ${safeTopic} that becomes obvious once you see it, but most people never connect the dots. Understanding this pattern changes how you think about everything related to the subject. It's the kind of insight that makes you wonder why it isn't common knowledge.`.slice(0, 400),
        supportingDetail: null,
        factType: 'mechanism',
        containsNumber: false,
        concretenessScore: 2,
        noveltyScore: 2,
        topicEntity: safeTopic,
        factRefs: [],
      },
      {
        slideNumber: 4,
        role: 'FACT',
        headline: `This changes how we should think about ${safeTopic}`.slice(0, 100),
        body: `When you combine these facts, the implication is clear: our default assumptions about ${safeTopic} need updating. The evidence demands a fresh perspective.`,
        supportingDetail: null,
        factType: 'mechanism',
        containsNumber: false,
        concretenessScore: 2,
        noveltyScore: 2,
        topicEntity: safeTopic,
        factRefs: [],
      },
      {
        slideNumber: 5,
        role: 'CTA',
        headline: `We post only interesting facts!`,
        body: `Follow us to get fresh facts everyday`,
        supportingDetail: null,
        factType: null,
        containsNumber: false,
        concretenessScore: 1,
        noveltyScore: 1,
        topicEntity: null,
        factRefs: [],
      },
    ],
  };
}

/**
 * Build fallback compressed slides directly from carousel slides.
 * Used when the compress LLM step fails.
 */
function buildFallbackCompressedSlides(slides: GeneratedSlideV2[]): CompressedSlideDisplay[] {
  return slides.map(s => ({
    slideNumber: s.slideNumber,
    displayTitle: truncateToWords(s.headline, 10),
    displaySupport: s.body ? truncateToWords(s.body.split(/(?<=[.!?])\s+/)[0] || '', 15) : '',
  }));
}

/** Take first N words from text. */
function truncateToWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return text.trim();
  return words.slice(0, max).join(' ');
}

/**
 * Replace the IMPLICATION slide with the strongest FACT content (Level 4 fallback).
 * Picks the fact slide with the highest concretenessScore + noveltyScore.
 */
function replaceImplicationWithStrongestFact(carousel: GeneratedCarousel): GeneratedCarousel {
  const slides = carousel.slides.map(s => ({ ...s }));
  const impIdx = slides.findIndex(s => s.role === 'IMPLICATION');
  if (impIdx === -1) return carousel;

  const facts = slides.filter(s => s.role === 'FACT');
  if (facts.length === 0) return carousel;

  // Pick strongest fact by combined score
  const strongest = facts.reduce((best, f) =>
    (f.concretenessScore + f.noveltyScore) > (best.concretenessScore + best.noveltyScore) ? f : best
  );

  slides[impIdx] = {
    ...slides[impIdx],
    headline: `The bigger picture: ${strongest.headline}`.slice(0, 100),
    body: `This single fact changes the entire conversation: ${strongest.body}`.slice(0, 400),
    supportingDetail: strongest.supportingDetail,
  };

  return { ...carousel, slides };
}

// ─── Pipeline Orchestrator ──────────────────────────────────

/**
 * Generate a full carousel through the multi-step pipeline:
 *   CONCEPT → MINE → DEDUPE → SELECT → EXPAND → COMPOSE → VALIDATE → PATCH (conditional) → COMPRESS
 *
 * FALLBACK HIERARCHY (never returns empty):
 *   Level 1: Normal pipeline (generate → compress → evaluate → upgrade)
 *   Level 2: Skip evaluation → use compressed output
 *   Level 3: Skip compression → use raw generated slides
 *   Level 4: Replace failed implication with strongest FACT
 *   Level 5: Generate minimal safe post (opener + 3 facts + implication + CTA)
 *
 * Each step does one thing well. LLM calls: 5 always (concept + mine + expand + compose + compress),
 * 1 conditionally (patch). Everything else is deterministic code.
 * Slide flow: OPENER → FACT (x3-4) → IMPLICATION → CTA
 */
export async function generateCarousel(
  params: PipelineParams,
  ai: AIProvider,
): Promise<PipelineResult> {
  const { topic, hook, knowledgeFacts, memory, pattern } = params;
  const fallbackMeta: FallbackMeta = { level: 'none', reason: '', stageErrors: [] };

  try {
    return await runPipeline(params, ai, fallbackMeta);
  } catch (pipelineError) {
    // ── LEVEL 5: Safe minimal post — absolute last resort ────
    const errorMsg = pipelineError instanceof Error ? pipelineError.message : String(pipelineError);
    fallbackMeta.level = 'safe_minimal';
    fallbackMeta.reason = `Full pipeline failed: ${errorMsg.slice(0, 300)}`;
    fallbackMeta.stageErrors.push({ stage: 'pipeline', error: errorMsg.slice(0, 300) });

    console.error(`[pipeline:fallback] LEVEL 5 — Generating safe minimal post. Reason: ${errorMsg.slice(0, 200)}`);

    const safeCarousel = buildSafeMinimalCarousel(topic, hook.text);
    const safeCompressed = buildFallbackCompressedSlides(safeCarousel.slides);
    const safeValidation: CarouselValidationReport = {
      passed: false,
      score: 0,
      slideResults: [],
      hardFails: [],
      softFlags: [],
      slidesToRegenerate: [],
    };

    return {
      carousel: safeCarousel,
      validation: safeValidation,
      qualityWarning: true,
      patchedSlideIndices: [],
      selectedFacts: [],
      expandedFacts: [],
      compressedSlides: safeCompressed,
      mode: params.mode || 'single_entity',
      concept: params.concept || topic,
      fallback: fallbackMeta,
    };
  }
}

/**
 * Inner pipeline with Level 1-4 fallbacks.
 * Separated from generateCarousel so Level 5 can catch any unhandled throw.
 */
async function runPipeline(
  params: PipelineParams,
  ai: AIProvider,
  fallbackMeta: FallbackMeta,
): Promise<PipelineResult> {
  const { topic, knowledgeFacts, memory, pattern } = params;
  let hook = params.hook;

  // ── Domain style classification ─────────────────────────
  const domainStyle = classifyDomainStyle(topic);
  console.log(`[pipeline] Domain style: ${domainStyle} (topic: "${topic}")`);

  // ── Step 0: CONCEPT ─────────────────────────────────────
  let mode: CarouselMode = params.mode || 'single_entity';
  let concept: string = params.concept || '';
  let angleDescription: string = '';

  if (!params.concept) {
    console.log(`[pipeline] Step 0: Selecting concept for "${topic}"...`);
    const conceptResult = await selectConcept(
      { topic, hook, usedConcepts: params.usedConcepts, direction: params.direction, channelNiche: params.channelNiche, channelName: params.channelName },
      ai,
    );
    mode = conceptResult.mode;
    concept = conceptResult.concept;
    angleDescription = conceptResult.angleDescription || '';

    // If the concept step suggested a sharper hook, use it
    if (conceptResult.suggestedHook && conceptResult.suggestedHook.length > 10) {
      console.log(`[pipeline] Hook revised by concept step: "${hook.text}" → "${conceptResult.suggestedHook}"`);
      hook = { ...hook, text: conceptResult.suggestedHook };
    }
  } else {
    console.log(`[pipeline] Step 0: Using pre-selected concept "${concept}" (${mode})`);
  }

  // ── Steps 1-3: MINE → DEDUPE → SELECT (with retry controller) ──

  const { selectResult, activeConcept } = await mineDedupeSelectWithRetry(
    { topic, hook, knowledgeFacts, pattern, mode, concept, domainStyle },
    ai,
  );

  // Update concept to the one that actually succeeded (may have been broadened)
  concept = activeConcept;

  // ── Step 3.5: EXPAND ──────────────────────────────────────
  console.log(`[pipeline] Step 3.5: Expanding ${selectResult.selected.length} facts...`);

  const expandResult = await expandFacts(
    { topic, hook, selectedFacts: selectResult.selected, mode, concept },
    ai,
  );

  console.log(`[pipeline] Expanded ${expandResult.expandedFacts.length} facts.`);

  // ── Step 4: COMPOSE ───────────────────────────────────────
  console.log(`[pipeline] Step 4: Composing carousel from ${expandResult.expandedFacts.length} expanded facts...`);

  const composePrompt = buildComposePrompt({
    topic,
    hook,
    selectedFacts: expandResult.expandedFacts,
    memory,
    mode,
    concept,
    domainStyle,
  });

  let composed: GeneratedCarousel;
  try {
    const result = await ai.generateObject(composePrompt, GeneratedCarouselSchema);
    composed = result.data;
  } catch (firstError) {
    // If compose fails (usually Zod parse error from invalid enum values),
    // retry once with the error message appended so the model can self-correct.
    const errorMsg = firstError instanceof Error ? firstError.message : String(firstError);
    console.warn(`[pipeline] Compose failed, retrying with error feedback: ${errorMsg.slice(0, 200)}`);

    const retryPrompt = composePrompt + `\n\n═══════════════════════════════════════════
RETRY — YOUR PREVIOUS OUTPUT FAILED VALIDATION
═══════════════════════════════════════════

Your previous response was rejected with this error:
${errorMsg.slice(0, 500)}

Fix the issue and return valid JSON. Pay special attention to:
- factType must be EXACTLY one of: statistic, comparison, mechanism, historical, example, definition
- slideNumber must match array index (0-indexed)
- First slide must be OPENER, second-to-last must be IMPLICATION, last must be CTA, all middle must be FACT
- Total slides must be 6-7 (OPENER + 3-4 FACTs + IMPLICATION + CTA)
- headline must be 20-100 characters
- FACT body must be 200-400 characters`;

    const retryResult = await ai.generateObject(retryPrompt, GeneratedCarouselSchema);
    composed = retryResult.data;
    console.log('[pipeline] Compose succeeded on retry.');
  }

  // ── Step 5: VALIDATE ──────────────────────────────────────
  console.log('[pipeline] Step 5: Validating carousel...');

  const report = validateCarousel(composed, topic, mode, concept);

  console.log(
    `[pipeline] Validation: ${report.passed ? 'PASSED' : 'FAILED'} ` +
    `(score: ${report.score}/100, hard fails: ${report.hardFails.length}, ` +
    `soft flags: ${report.softFlags.length})`
  );

  if (report.passed) {
    // ── LEVEL 1: Normal pipeline — compress with full evaluation ──
    return await compressAndReturn({
      composed, report, selectResult, expandResult, mode, concept,
      topic, ai, patchedSlideIndices: [], fallbackMeta, angleDescription,
    });
  }

  // ── Step 6: PATCH (one attempt) ───────────────────────────
  let patched: GeneratedCarousel;
  let finalReport: CarouselValidationReport;
  let patchedSlideIndices: number[];

  try {
    const failingSlides = getFailingSlidesWithReasons(report);

    console.log(
      `[pipeline] Step 6: Patching ${failingSlides.length} failing slide(s): ` +
      `[${failingSlides.map(f => f.slideIndex).join(', ')}]`
    );

    const patchPrompt = buildPatchPrompt({
      topic,
      mode,
      concept,
      slides: composed.slides.map(s => ({
        slideIndex: s.slideNumber,
        role: s.role,
        headline: s.headline,
        body: s.body,
        supportingDetail: s.supportingDetail,
      })),
      targets: failingSlides.map(f => {
        const slide = composed.slides[f.slideIndex];
        const sourceFact = slide.role === 'FACT'
          ? selectResult.selected[f.slideIndex - 1]
          : undefined;

        return {
          slideIndex: f.slideIndex,
          role: slide.role,
          currentHeadline: slide.headline,
          currentBody: slide.body,
          failures: f.reasons,
          sourceFact,
        };
      }),
    });

    const { data: patchResult } = await ai.generateObject(patchPrompt, PatchResponse);
    patched = applyPatches(composed, patchResult.replacements);
    finalReport = validateCarousel(patched, topic, mode, concept);
    patchedSlideIndices = patchResult.replacements.map(r => r.slideIndex);

    const stillFailing = finalReport.slidesToRegenerate;
    if (stillFailing.length > 0) {
      console.warn(
        `[pipeline] ${stillFailing.length} slide(s) still failing after patch: ` +
        `[${stillFailing.join(', ')}]`
      );
    } else {
      console.log('[pipeline] All slides pass after patching.');
    }
  } catch (patchError) {
    // Patch failed — fall through to compress with the original composed carousel
    const errorMsg = patchError instanceof Error ? patchError.message : String(patchError);
    fallbackMeta.stageErrors.push({ stage: 'patch', error: errorMsg.slice(0, 300) });
    console.warn(`[pipeline:fallback] Patch failed, using unpatched carousel: ${errorMsg.slice(0, 200)}`);

    patched = composed;
    finalReport = report;
    patchedSlideIndices = [];
  }

  // ── LEVEL 4: Replace implication if it's the failing slide ──
  const impSlide = patched.slides.find(s => s.role === 'IMPLICATION');
  const impFailing = impSlide && finalReport.slidesToRegenerate.includes(impSlide.slideNumber);
  if (impFailing) {
    console.warn('[pipeline:fallback] LEVEL 4 — Replacing failed implication with strongest FACT');
    fallbackMeta.stageErrors.push({ stage: 'implication', error: 'Implication slide failed validation' });
    patched = replaceImplicationWithStrongestFact(patched);
    // Re-validate after implication replacement
    finalReport = validateCarousel(patched, topic, mode, concept);
    if (fallbackMeta.level === 'none') {
      fallbackMeta.level = 'replace_implication';
      fallbackMeta.reason = 'Implication slide failed validation; replaced with strongest fact';
    }
  }

  // ── Compress (with Level 2/3 fallbacks) ────────────────────
  return await compressAndReturn({
    composed: patched, report: finalReport, selectResult, expandResult, mode, concept,
    topic, ai, patchedSlideIndices, fallbackMeta, angleDescription,
  });
}

// ─── Compress & Return (with Level 2/3 fallbacks) ───────────

interface CompressAndReturnParams {
  composed: GeneratedCarousel;
  report: CarouselValidationReport;
  selectResult: { selected: MinedFact[]; consideredCount: number; numberFactCount: number };
  expandResult: { expandedFacts: ExpandedFact[] };
  mode: CarouselMode;
  concept: string;
  topic: string;
  ai: AIProvider;
  patchedSlideIndices: number[];
  fallbackMeta: FallbackMeta;
  angleDescription?: string;
}

async function compressAndReturn(params: CompressAndReturnParams): Promise<PipelineResult> {
  const {
    composed, report, selectResult, expandResult, mode, concept,
    topic, ai, patchedSlideIndices, fallbackMeta, angleDescription,
  } = params;

  let compressedSlides: CompressedSlideDisplay[];

  try {
    // ── LEVEL 1 / LEVEL 2: Compress (full or skip-eval) ─────
    console.log('[pipeline] Compressing slides for display...');
    const compressResult = await compressSlides({ topic, slides: composed.slides, angleDescription }, ai);
    compressedSlides = compressResult.compressed;
    console.log(`[pipeline] Compressed ${compressedSlides.length} slides.`);
  } catch (compressError) {
    // ── LEVEL 3: Compression failed — use raw slides ────────
    const errorMsg = compressError instanceof Error ? compressError.message : String(compressError);
    fallbackMeta.stageErrors.push({ stage: 'compress', error: errorMsg.slice(0, 300) });

    console.warn(`[pipeline:fallback] LEVEL 3 — Compression failed, using raw slide text: ${errorMsg.slice(0, 200)}`);
    compressedSlides = buildFallbackCompressedSlides(composed.slides);

    if (fallbackMeta.level === 'none' || fallbackMeta.level === 'replace_implication') {
      fallbackMeta.level = 'skip_compression';
      fallbackMeta.reason = `Compression failed: ${errorMsg.slice(0, 200)}`;
    }
  }

  // ── Guarantee: NEVER return empty slides array ────────────
  if (!composed.slides || composed.slides.length === 0) {
    console.error('[pipeline:fallback] CRITICAL — Carousel has no slides after pipeline. Generating safe minimal.');
    throw new Error('Carousel produced zero slides — triggering Level 5 fallback');
  }

  if (!compressedSlides || compressedSlides.length === 0) {
    console.warn('[pipeline:fallback] Compressed slides empty — rebuilding from raw slides');
    compressedSlides = buildFallbackCompressedSlides(composed.slides);
  }

  const result: PipelineResult = {
    carousel: composed,
    validation: report,
    qualityWarning: !report.passed || fallbackMeta.level !== 'none',
    patchedSlideIndices,
    selectedFacts: selectResult.selected,
    expandedFacts: expandResult.expandedFacts,
    compressedSlides,
    mode,
    concept,
  };

  if (fallbackMeta.level !== 'none') {
    result.fallback = fallbackMeta;
    console.warn(
      `[pipeline:fallback] Returning with fallback level="${fallbackMeta.level}": ${fallbackMeta.reason}`
    );
  }

  return result;
}

// ─── Retry Controller: MINE → DEDUPE → SELECT ──────────────

interface MineDedupeSelectParams {
  topic: string;
  hook: { text: string; type: string };
  knowledgeFacts?: Array<{ id: string; text: string; entities: string[] }>;
  pattern?: string;
  mode: CarouselMode;
  concept: string;
  domainStyle?: import('@/lib/utils/topic-classifier').TopicDomainStyle;
}

interface MineDedupeSelectResult {
  selectResult: { selected: MinedFact[]; consideredCount: number; numberFactCount: number };
  activeConcept: string;
}

/**
 * Run the MINE → DEDUPE → SELECT pipeline with up to 2 retries
 * when fewer than MIN_FACTS_REQUIRED survive selection.
 *
 * Retry #1: Broaden the concept (LLM call) and re-mine.
 * Retry #2: Increase candidate pool from 18 → 30 and re-mine with broadened concept.
 * Hard fallback: Accept 2 facts if both retries fail.
 */
async function mineDedupeSelectWithRetry(
  params: MineDedupeSelectParams,
  ai: AIProvider,
): Promise<MineDedupeSelectResult> {
  const { topic, hook, knowledgeFacts, pattern, mode, domainStyle } = params;
  let activeConcept = params.concept;
  let candidateCount = DEFAULT_CANDIDATE_COUNT;
  const retryLogs: RetryLog[] = [];

  // ── Initial attempt ──────────────────────────────────────
  console.log(`[pipeline] Step 1: Mining facts for "${activeConcept}" (${mode}, domain: ${domainStyle ?? 'auto'})...`);

  let mineResult = await mineFacts(
    { topic, hook, knowledgeFacts, pattern, mode, concept: activeConcept, candidateCount, domainStyle },
    ai,
  );

  console.log('[pipeline] Step 2: Deduplicating candidates...');
  let dedupeResult = dedupeFacts(mineResult.candidates);

  console.log('[pipeline] Step 3: Curating best facts...');
  let selectResult = await curateFacts(dedupeResult.candidates, topic, hook.text, ai);

  // ── Retry loop ───────────────────────────────────────────
  if (selectResult.selected.length < MIN_FACTS_REQUIRED) {
    const originalConcept = params.concept;

    // ── Retry #1: Broaden concept ──────────────────────────
    console.warn(
      `[pipeline:retry] Only ${selectResult.selected.length}/${MIN_FACTS_REQUIRED} facts survived. ` +
      `Retry #1: Broadening concept "${activeConcept}"...`
    );

    activeConcept = await broadenConcept(
      { originalConcept: activeConcept, topic, hook },
      ai,
    );

    mineResult = await mineFacts(
      { topic, hook, knowledgeFacts, pattern, mode, concept: activeConcept, candidateCount, domainStyle },
      ai,
    );
    dedupeResult = dedupeFacts(mineResult.candidates);
    selectResult = await curateFacts(dedupeResult.candidates, topic, hook.text, ai);

    retryLogs.push({
      reason: 'insufficient_facts',
      attempt: 1,
      originalConcept,
      newConcept: activeConcept,
      candidateCount,
      finalFactCount: selectResult.selected.length,
    });

    console.log(
      `[pipeline:retry] Attempt 1 result: ${JSON.stringify(retryLogs[0])}`
    );

    // ── Retry #2: Increase candidate pool ────────────────
    if (selectResult.selected.length < MIN_FACTS_REQUIRED) {
      candidateCount = EXPANDED_CANDIDATE_COUNT;

      console.warn(
        `[pipeline:retry] Still only ${selectResult.selected.length}/${MIN_FACTS_REQUIRED} facts. ` +
        `Retry #2: Expanding pool to ${candidateCount} candidates...`
      );

      mineResult = await mineFacts(
        { topic, hook, knowledgeFacts, pattern, mode, concept: activeConcept, candidateCount },
        ai,
      );
      dedupeResult = dedupeFacts(mineResult.candidates);
      selectResult = await curateFacts(dedupeResult.candidates, topic, hook.text, ai);

      retryLogs.push({
        reason: 'insufficient_facts',
        attempt: 2,
        originalConcept,
        newConcept: activeConcept,
        candidateCount,
        finalFactCount: selectResult.selected.length,
      });

      console.log(
        `[pipeline:retry] Attempt 2 result: ${JSON.stringify(retryLogs[1])}`
      );
    }

    // ── Hard fallback: accept 2 facts ────────────────────
    if (selectResult.selected.length < MIN_FACTS_HARD_FALLBACK) {
      throw new Error(
        `[pipeline] Only ${selectResult.selected.length} facts survived after ${retryLogs.length} retries ` +
        `for topic "${topic}" (hard minimum ${MIN_FACTS_HARD_FALLBACK}). ` +
        `Original concept: "${originalConcept}", broadened to: "${activeConcept}". ` +
        `Last mine produced ${mineResult.candidates.length}, ` +
        `dedup kept ${dedupeResult.candidates.length}, ` +
        `select returned ${selectResult.selected.length}.`
      );
    }

    if (selectResult.selected.length < MIN_FACTS_REQUIRED) {
      console.warn(
        `[pipeline:retry] Accepting ${selectResult.selected.length} facts (below preferred ${MIN_FACTS_REQUIRED}, ` +
        `above hard minimum ${MIN_FACTS_HARD_FALLBACK}) after ${retryLogs.length} retries.`
      );
    }
  }

  return { selectResult, activeConcept };
}

// ─── Patch Merge ────────────────────────────────────────────

/**
 * Merge patched slides back into the carousel.
 *
 * PatchedSlide uses `slideIndex`, GeneratedSlideV2 uses `slideNumber`.
 * This function converts and replaces in place.
 */
function applyPatches(
  carousel: GeneratedCarousel,
  replacements: PatchedSlide[],
): GeneratedCarousel {
  const slides: GeneratedSlideV2[] = carousel.slides.map(s => ({ ...s }));

  for (const replacement of replacements) {
    const idx = slides.findIndex(s => s.slideNumber === replacement.slideIndex);
    if (idx !== -1) {
      slides[idx] = {
        slideNumber: replacement.slideIndex,
        role: replacement.role,
        headline: replacement.headline,
        body: replacement.body,
        supportingDetail: replacement.supportingDetail,
        factType: replacement.factType,
        containsNumber: replacement.containsNumber,
        concretenessScore: replacement.concretenessScore,
        noveltyScore: replacement.noveltyScore,
        topicEntity: replacement.topicEntity,
        factRefs: replacement.factRefs,
      };
    }
  }

  return {
    title: carousel.title,
    topicConfidence: carousel.topicConfidence,
    slides,
  };
}
