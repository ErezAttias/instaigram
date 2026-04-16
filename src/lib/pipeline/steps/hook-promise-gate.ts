/**
 * Hook–Body Promise Gate — Editorial Promise Integrity
 *
 * Runs AFTER narrative coherence gate, BEFORE image rendering.
 * Ensures the hook's promise is actually fulfilled by the fact slides.
 *
 * A carousel fails this gate if:
 *   - The hook suggests one kind of surprise, but the facts deliver another
 *   - The hook is broader/stronger/stranger than the body supports
 *   - The body feels less intense than the hook promised
 *
 * Fix strategy: pick the cheaper edit —
 *   - Rewrite hook downward (1 slide change, preserves all facts)
 *   - Rewrite 1–2 facts upward (keeps the stronger hook)
 */

import type { AIProvider } from '@/lib/ai/types';
import type { GeneratedSlideV2, CompressedSlideDisplay } from '@/lib/validation/schemas';
import { compressSlides } from './compress';
import { z } from 'zod';

// ─── Types ──────────────────────────────────────────────────

export interface PromiseIssue {
  type: 'PROMISE_MISMATCH' | 'PROMISE_OVERSHOOT' | 'PROMISE_UNDERSHOOT';
  detail: string;
}

export interface HookPromiseGateResult {
  slides: GeneratedSlideV2[];
  compressedSlides: CompressedSlideDisplay[];
  /** Updated hook text (may differ from input if hook was rewritten) */
  hookText: string;
  issues: PromiseIssue[];
  rewriteCount: number;
  action: 'pass' | 'hook_rewritten' | 'facts_rewritten';
}

// ─── Promise Type Taxonomy ──────────────────────────────────

const PromiseType = z.enum([
  'fake-but-true',
  'things-you-think-you-know',
  'hidden-truth',
  'bigger-than-expected',
  'weirder-than-expected',
  'myth-busting',
  'comparison-reversal',
  'counting-surprise',
  'mechanism-reveal',
]);

const DeliveryType = z.enum([
  'fake-but-true',
  'things-you-think-you-know',
  'hidden-truth',
  'bigger-than-expected',
  'weirder-than-expected',
  'myth-busting',
  'comparison-reversal',
  'counting-surprise',
  'mechanism-reveal',
  'trivia-collection',
  'general-education',
]);

// ─── LLM Analysis Schema ────────────────────────────────────

const HookPromiseAnalysis = z.object({
  /** What the hook promises the reader will learn */
  hookPromise: z.object({
    type: PromiseType,
    /** The specific claim or gap the hook creates, in ≤15 words */
    impliedClaim: z.string(),
    /** Intensity 1-5: how bold/extreme is the promise? */
    intensity: z.number().min(1).max(5),
  }),

  /** What the FACT slides actually deliver */
  bodyDelivery: z.object({
    /** Primary delivery type across the fact slides */
    primaryType: DeliveryType,
    /** Secondary delivery type if facts are mixed */
    secondaryType: DeliveryType.nullable(),
    /** Intensity 1-5: how strong/surprising is the actual content? */
    intensity: z.number().min(1).max(5),
    /** Which specific facts fulfill the hook promise? (slideNumbers) */
    fulfillingSlides: z.array(z.number()),
    /** Which facts feel disconnected from the hook? (slideNumbers) */
    disconnectedSlides: z.array(z.number()),
  }),

  /** Overall alignment score 1-5 */
  alignmentScore: z.number().min(1).max(5),

  /** Diagnosis if score < 4 */
  diagnosis: z.string().nullable(),

  /** Recommended fix: 'rewrite_hook' or 'rewrite_facts' or 'pass' */
  recommendedFix: z.enum(['rewrite_hook', 'rewrite_facts', 'pass']),
});

type HookPromiseAnalysisType = z.infer<typeof HookPromiseAnalysis>;

// ─── Analysis Prompt ────────────────────────────────────────

function buildAnalysisPrompt(
  hookText: string,
  openerHeadline: string,
  facts: GeneratedSlideV2[],
  topic: string,
): string {
  const factBlock = facts
    .map(f => `  Slide ${f.slideNumber + 1}: "${f.headline}"
    body: "${f.body.slice(0, 200)}${f.body.length > 200 ? '...' : ''}"`)
    .join('\n');

  return `You are an editorial quality analyst for Instagram carousels.

TOPIC: "${topic}"
HOOK (original): "${hookText}"
OPENER (slide 1 headline): "${openerHeadline}"

FACT SLIDES:
${factBlock}

TASK: Evaluate whether the hook's PROMISE matches what the fact slides actually DELIVER.

STEP 1 — CLASSIFY THE HOOK PROMISE
What type of surprise does the hook set up? Pick ONE:
- fake-but-true: "This sounds made up but it's real"
- things-you-think-you-know: "You think you know X, but you're wrong"
- hidden-truth: "There's something about X nobody talks about"
- bigger-than-expected: "X is way larger/more/longer than you'd guess"
- weirder-than-expected: "X does something bizarre"
- myth-busting: "What you've been told about X is wrong"
- comparison-reversal: "X is actually better/worse/bigger than Y"
- counting-surprise: "The number of X will shock you"
- mechanism-reveal: "Here's HOW X actually works (and it's not what you think)"

Rate the hook's INTENSITY 1-5:
  1 = mild curiosity ("here's something about X")
  2 = moderate ("X is more complex than you think")
  3 = strong ("X will change how you see Y")
  4 = very bold ("Everything you know about X is wrong")
  5 = extreme ("X literally [outrageous claim]")

STEP 2 — CLASSIFY BODY DELIVERY
What do the fact slides actually deliver? Pick the PRIMARY type from the same list above, plus:
- trivia-collection: assorted facts, no unified thread
- general-education: educational but no surprise angle

Rate the body's INTENSITY 1-5 (how surprising/strong is the actual content?).

Identify which slides FULFILL the hook promise and which feel DISCONNECTED.

STEP 3 — SCORE ALIGNMENT (1-5)
  1 = Complete mismatch (hook promises myth-busting, facts are general trivia)
  2 = Weak connection (hook implies reversal, one fact sort-of delivers)
  3 = Partial match (hook promise type matches but intensity is much weaker)
  4 = Good match (most facts deliver on the promise, intensity is close)
  5 = Perfect match (every fact reinforces the hook's specific claim)

STEP 4 — RECOMMEND FIX (if score < 4)
Compare the cost:
- "rewrite_hook": If facts are good but hook oversells → tone down the hook (1 change)
- "rewrite_facts": If hook is compelling but facts underdeliver → strengthen weak facts
- "pass": If score >= 4

Choose the cheaper fix. If hook intensity exceeds body intensity by 2+, prefer rewrite_hook.
If body type simply doesn't match hook type, prefer rewrite_facts.

Return JSON:
{
  "hookPromise": { "type": "...", "impliedClaim": "...", "intensity": N },
  "bodyDelivery": {
    "primaryType": "...",
    "secondaryType": "..." or null,
    "intensity": N,
    "fulfillingSlides": [N, ...],
    "disconnectedSlides": [N, ...]
  },
  "alignmentScore": N,
  "diagnosis": "..." or null,
  "recommendedFix": "pass" | "rewrite_hook" | "rewrite_facts"
}`;
}

// ─── Hook Rewrite Prompt ────────────────────────────────────

function buildHookRewritePrompt(
  currentHook: string,
  openerSlide: GeneratedSlideV2,
  facts: GeneratedSlideV2[],
  topic: string,
  analysis: HookPromiseAnalysisType,
): string {
  const factSummary = facts
    .map(f => `  Slide ${f.slideNumber + 1}: "${f.headline}"`)
    .join('\n');

  return `You are rewriting a carousel OPENER because the hook over-promises relative to the facts.

TOPIC: "${topic}"
CURRENT HOOK: "${currentHook}"
CURRENT OPENER HEADLINE: "${openerSlide.headline}"
CURRENT OPENER BODY: "${openerSlide.body}"

DIAGNOSIS: ${analysis.diagnosis}
Hook promise type: ${analysis.hookPromise.type} (intensity ${analysis.hookPromise.intensity}/5)
Body delivery type: ${analysis.bodyDelivery.primaryType} (intensity ${analysis.bodyDelivery.intensity}/5)
Alignment score: ${analysis.alignmentScore}/5

FACTS THAT THE HOOK MUST MATCH:
${factSummary}

REWRITE RULES:
- The new hook MUST accurately frame what the facts actually deliver
- Match the body's delivery type: "${analysis.bodyDelivery.primaryType}"
- Target intensity: ${analysis.bodyDelivery.intensity}/5 (match the body, don't oversell)
- headline: 20–80 chars, creates a curiosity gap that the EXISTING facts can close
- body: 0–60 chars (optional), only if it sharpens the gap
- The hook must still be compelling — tone down, don't make it boring
- Include at least one concrete anchor (number, entity, comparison) from the facts
- Do NOT use: "interesting", "surprising", "most people don't know", "the truth about"

Return JSON:
{
  "headline": "...",
  "body": "...",
  "supportingDetail": null,
  "factType": null,
  "containsNumber": true/false,
  "concretenessScore": 1-5,
  "noveltyScore": 1-5,
  "topicEntity": "..." or null
}`;
}

// ─── Fact Upgrade Prompt ────────────────────────────────────

function buildFactUpgradePrompt(
  slideToUpgrade: GeneratedSlideV2,
  allSlides: GeneratedSlideV2[],
  hookText: string,
  topic: string,
  analysis: HookPromiseAnalysisType,
): string {
  const carouselContext = allSlides
    .map(s => `  Slide ${s.slideNumber + 1} (${s.role}): "${s.headline}"`)
    .join('\n');

  return `You are upgrading a FACT slide to better deliver on the carousel hook's promise.

TOPIC: "${topic}"
HOOK: "${hookText}"
HOOK PROMISE: ${analysis.hookPromise.type} — "${analysis.hookPromise.impliedClaim}"
HOOK INTENSITY: ${analysis.hookPromise.intensity}/5

SLIDE TO UPGRADE: Slide ${slideToUpgrade.slideNumber + 1}
  Current headline: "${slideToUpgrade.headline}"
  Current body: "${slideToUpgrade.body}"
  Current factType: ${slideToUpgrade.factType || 'unknown'}

This slide was flagged as DISCONNECTED from the hook promise.

FULL CAROUSEL:
${carouselContext}

UPGRADE RULES:
- Rewrite to DIRECTLY support the hook's promise type: "${analysis.hookPromise.type}"
- The fact should make a reader think "wow, the hook was RIGHT"
- Keep it about "${topic}" — same subject, stronger angle
- Match the hook's intensity level (${analysis.hookPromise.intensity}/5)
- headline: 20–100 chars, specific claim that reinforces the hook
- body: 200–400 chars, must include number, entity, or comparison
- Do NOT duplicate any other slide's idea
- Do NOT use vague framing or abstract filler

Return JSON:
{
  "headline": "...",
  "body": "...",
  "supportingDetail": "..." or null,
  "factType": "one of: statistic, comparison, mechanism, historical, example, definition",
  "containsNumber": true/false,
  "concretenessScore": 1-5,
  "noveltyScore": 1-5,
  "topicEntity": "..." or null
}`;
}

// ─── Main Gate ──────────────────────────────────────────────

export async function runHookPromiseGate(
  slides: GeneratedSlideV2[],
  compressedSlides: CompressedSlideDisplay[],
  topic: string,
  hookText: string,
  ai: AIProvider,
  layout?: 'DETAILED' | 'BOLD',
): Promise<HookPromiseGateResult> {
  const opener = slides.find(s => s.role === 'OPENER');
  const facts = slides.filter(s => s.role === 'FACT');

  if (!opener || facts.length < 2) {
    console.log('[HookPromiseGate] Not enough slides — skipping');
    return { slides, compressedSlides, hookText, issues: [], rewriteCount: 0, action: 'pass' };
  }

  // ── 1. LLM Analysis ─────────────────────────────────────

  let analysis: HookPromiseAnalysisType;
  let analysisFailed = false;
  try {
    const prompt = buildAnalysisPrompt(hookText, opener.headline, facts, topic);
    const { data } = await ai.generateObject(prompt, HookPromiseAnalysis);
    analysis = data;

    console.log(`[HookPromiseGate] Hook: ${analysis.hookPromise.type} (intensity ${analysis.hookPromise.intensity})`);
    console.log(`[HookPromiseGate] Body: ${analysis.bodyDelivery.primaryType} (intensity ${analysis.bodyDelivery.intensity})`);
    console.log(`[HookPromiseGate] Alignment: ${analysis.alignmentScore}/5, fix: ${analysis.recommendedFix}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    analysisFailed = true;

    // Fallback: use a conservative default analysis that flags as unvalidated
    // rather than silently passing. The LLM often returns a promise type
    // not in the enum — catch that specifically.
    const isSchemaError = msg.includes('schema validation failed') || msg.includes('Invalid option');
    if (isSchemaError) {
      console.warn(`[HookPromiseGate] SCHEMA MISMATCH in analysis — LLM returned a value outside the enum. Using fallback analysis.`);
    } else {
      console.warn(`[HookPromiseGate] Analysis failed: ${msg}`);
    }

    // Fallback analysis: assume alignment is uncertain (score 3) and pass
    // without rewrites, but mark the result so downstream can see it wasn't validated.
    analysis = {
      hookPromise: { type: 'hidden-truth', impliedClaim: 'unknown (analysis failed)', intensity: 3 },
      bodyDelivery: { primaryType: 'general-education', secondaryType: null, intensity: 3, fulfillingSlides: [], disconnectedSlides: [] },
      alignmentScore: 3,
      diagnosis: `Analysis failed: ${isSchemaError ? 'LLM returned unrecognized promise type' : msg.slice(0, 100)}`,
      recommendedFix: 'pass',
    };
    console.warn(`[HookPromiseGate] Using fallback analysis with alignment=3/5 (UNVALIDATED)`);
  }

  // ── 2. Check if passing ──────────────────────────────────

  if (analysis.alignmentScore >= 4) {
    console.log(`[HookPromiseGate] Score ${analysis.alignmentScore}/5 — passed`);
    return { slides, compressedSlides, hookText, issues: [], rewriteCount: 0, action: 'pass' };
  }

  // If analysis failed and we're using fallback, don't try to rewrite — just report
  if (analysisFailed) {
    console.warn(`[HookPromiseGate] Score ${analysis.alignmentScore}/5 (UNVALIDATED) — no rewrites attempted`);
    return {
      slides, compressedSlides, hookText,
      issues: [{ type: 'PROMISE_MISMATCH', detail: `Hook-promise analysis failed — alignment unvalidated (fallback score ${analysis.alignmentScore}/5)` }],
      rewriteCount: 0,
      action: 'pass',
    };
  }

  // ── 3. Build issues ──────────────────────────────────────

  const issues: PromiseIssue[] = [];

  if (analysis.hookPromise.type !== analysis.bodyDelivery.primaryType) {
    issues.push({
      type: 'PROMISE_MISMATCH',
      detail: `Hook promises "${analysis.hookPromise.type}" but body delivers "${analysis.bodyDelivery.primaryType}"`,
    });
  }

  if (analysis.hookPromise.intensity > analysis.bodyDelivery.intensity + 1) {
    issues.push({
      type: 'PROMISE_OVERSHOOT',
      detail: `Hook intensity ${analysis.hookPromise.intensity}/5 exceeds body intensity ${analysis.bodyDelivery.intensity}/5`,
    });
  }

  if (analysis.bodyDelivery.intensity > analysis.hookPromise.intensity + 1) {
    issues.push({
      type: 'PROMISE_UNDERSHOOT',
      detail: `Body intensity ${analysis.bodyDelivery.intensity}/5 exceeds hook intensity ${analysis.hookPromise.intensity}/5 — hook undersells`,
    });
  }

  if (issues.length === 0 && analysis.diagnosis) {
    issues.push({
      type: 'PROMISE_MISMATCH',
      detail: analysis.diagnosis,
    });
  }

  console.warn(`[HookPromiseGate] Score ${analysis.alignmentScore}/5 — ${issues.length} issues:`);
  for (const issue of issues) {
    console.warn(`  ${issue.type}: ${issue.detail}`);
  }

  // ── 4. Apply fix ─────────────────────────────────────────

  const updatedSlides = [...slides];
  let updatedHook = hookText;
  let rewriteCount = 0;
  let action: HookPromiseGateResult['action'] = 'pass';

  const { RewrittenSlide: RewrittenSlideSchema } = await import('@/lib/validation/schemas');

  if (analysis.recommendedFix === 'rewrite_hook') {
    // ── 4a. Rewrite hook downward ────────────────────────
    try {
      const prompt = buildHookRewritePrompt(hookText, opener, facts, topic, analysis);
      const { data: rewritten } = await ai.generateObject(prompt, RewrittenSlideSchema);

      const openerIdx = updatedSlides.findIndex(s => s.role === 'OPENER');
      if (openerIdx !== -1) {
        updatedSlides[openerIdx] = {
          ...updatedSlides[openerIdx],
          headline: rewritten.headline,
          body: rewritten.body,
          supportingDetail: rewritten.supportingDetail,
          topicEntity: rewritten.topicEntity,
          containsNumber: rewritten.containsNumber,
          concretenessScore: rewritten.concretenessScore,
          noveltyScore: rewritten.noveltyScore,
        };
        updatedHook = rewritten.headline;
        rewriteCount = 1;
        action = 'hook_rewritten';
        console.log(`[HookPromiseGate] Hook rewritten: "${opener.headline.slice(0, 40)}..." → "${rewritten.headline.slice(0, 40)}..."`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[HookPromiseGate] HOOK REWRITE FAILED: ${msg}`);
      console.error(`[HookPromiseGate] Original hook kept — alignment score remains ${analysis.alignmentScore}/5`);
    }
  } else if (analysis.recommendedFix === 'rewrite_facts') {
    // ── 4b. Upgrade disconnected facts ───────────────────
    const targets = analysis.bodyDelivery.disconnectedSlides.slice(0, 2);

    for (const slideNum of targets) {
      const slide = updatedSlides.find(s => s.slideNumber === slideNum);
      if (!slide || slide.role !== 'FACT') continue;

      try {
        const prompt = buildFactUpgradePrompt(slide, updatedSlides, hookText, topic, analysis);
        const { data: rewritten } = await ai.generateObject(prompt, RewrittenSlideSchema);

        const idx = updatedSlides.findIndex(s => s.slideNumber === slideNum);
        if (idx !== -1) {
          updatedSlides[idx] = {
            ...updatedSlides[idx],
            headline: rewritten.headline,
            body: rewritten.body,
            supportingDetail: rewritten.supportingDetail,
            factType: rewritten.factType,
            containsNumber: rewritten.containsNumber,
            concretenessScore: rewritten.concretenessScore,
            noveltyScore: rewritten.noveltyScore,
            topicEntity: rewritten.topicEntity,
          };
          rewriteCount++;
          console.log(`[HookPromiseGate] Fact ${slideNum + 1} upgraded: "${slide.headline.slice(0, 40)}..." → "${rewritten.headline.slice(0, 40)}..."`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[HookPromiseGate] FACT UPGRADE FAILED for slide ${slideNum + 1}: ${msg}`);
        console.error(`[HookPromiseGate] Original kept — slide ${slideNum + 1} still disconnected from hook promise`);
      }
    }

    if (rewriteCount > 0) action = 'facts_rewritten';
  }

  // ── 5. Re-compress if anything changed ──────────────────

  let updatedCompressed = [...compressedSlides];

  if (rewriteCount > 0) {
    try {
      const compressResult = await compressSlides(
        { topic, slides: updatedSlides, layout },
        ai,
      );
      updatedCompressed = compressResult.compressed;
    } catch {
      console.warn(`[HookPromiseGate] Re-compress failed — using fallback truncation`);
      updatedCompressed = updatedSlides.map(s => ({
        slideNumber: s.slideNumber,
        displayTitle: s.headline,
        displaySupport: s.body,
      }));
    }
  }

  console.log(`[HookPromiseGate] Complete: score=${analysis.alignmentScore}/5, action=${action}, rewrites=${rewriteCount}`);

  return {
    slides: updatedSlides,
    compressedSlides: updatedCompressed,
    hookText: updatedHook,
    issues,
    rewriteCount,
    action,
  };
}
