/**
 * Narrative Coherence Gate — Semantic + Structural Intelligence
 *
 * Runs AFTER copy-quality-gate, BEFORE image rendering.
 * Uses a single LLM-as-judge call to evaluate the full carousel:
 *
 *   1. Semantic duplication — do two FACTs express the same underlying idea?
 *   2. Conceptual diversity — does each FACT cover a different angle?
 *   3. Narrative escalation — do FACTs build from simplest → strongest?
 *
 * Decisions: reorder (cheap) or rewrite (LLM call) as needed.
 */

import type { AIProvider } from '@/lib/ai/types';
import type { GeneratedSlideV2, CompressedSlideDisplay } from '@/lib/validation/schemas';
import { compressSlides } from './compress';
import { z } from 'zod';

// ─── Types ──────────────────────────────────────────────────

export interface NarrativeIssue {
  type: 'SEMANTIC_DUPLICATE' | 'SAME_CATEGORY' | 'FLAT_ESCALATION' | 'WRONG_ORDER';
  slideIndices: number[];
  detail: string;
}

export interface NarrativeGateResult {
  slides: GeneratedSlideV2[];
  compressedSlides: CompressedSlideDisplay[];
  issues: NarrativeIssue[];
  rewriteCount: number;
  reorderApplied: boolean;
}

// ─── LLM Analysis Schema ────────────────────────────────────

const FactAnalysis = z.object({
  slideNumber: z.number(),
  /** Conceptual category: what type of insight this fact represents */
  category: z.enum([
    'classification', 'behavior', 'biology', 'perception',
    'scale', 'comparison', 'mechanism', 'history', 'consequence',
  ]),
  /** Core claim in ≤12 words — the irreducible idea */
  coreClaim: z.string(),
  /** Novelty score 1-10: how surprising/counterintuitive is this fact? */
  noveltyScore: z.number().min(1).max(10),
});

const NarrativeAnalysis = z.object({
  facts: z.array(FactAnalysis),
  /** Pairs of slideNumbers that express the same underlying idea */
  semanticDuplicates: z.array(z.object({
    slideA: z.number(),
    slideB: z.number(),
    sharedIdea: z.string(),
  })),
  /** Pairs of slideNumbers that fall into the same conceptual category */
  categoryCollisions: z.array(z.object({
    slideA: z.number(),
    slideB: z.number(),
    category: z.string(),
  })),
  /** Recommended order of FACT slideNumbers (lowest novelty first, highest last) */
  recommendedOrder: z.array(z.number()),
  /** Is the current order already well-escalated? */
  escalationOk: z.boolean(),
});

type NarrativeAnalysisType = z.infer<typeof NarrativeAnalysis>;

// ─── Analysis Prompt ────────────────────────────────────────

function buildAnalysisPrompt(
  facts: GeneratedSlideV2[],
  topic: string,
): string {
  const slideBlock = facts
    .map(f => `Slide ${f.slideNumber + 1} (factType: ${f.factType || 'unknown'}):
  headline: "${f.headline}"
  body: "${f.body}"`)
    .join('\n\n');

  return `You are a carousel content analyst. Analyze these ${facts.length} FACT slides about "${topic}".

${slideBlock}

TASKS:

1. CATEGORIZE each slide into exactly ONE category:
   classification, behavior, biology, perception, scale, comparison, mechanism, history, consequence

2. EXTRACT the core claim of each slide in ≤12 words (the irreducible factual idea, not the phrasing).

3. SCORE novelty 1-10 for each slide:
   1-3 = commonly known / intuitive
   4-6 = somewhat surprising
   7-8 = counterintuitive
   9-10 = genuinely shocking / paradigm-shifting

4. DETECT SEMANTIC DUPLICATES: Two slides are semantic duplicates if they express the SAME underlying idea from different angles. Examples:
   - "Dogs see blue and yellow" ≈ "Dogs can't see red and green" (same idea: dog color vision is limited)
   - "Bulls react to movement" ≈ "Bulls ignore color" (same idea: bulls don't respond to color)
   - "Honey never spoils" ≈ "3000-year-old honey is still edible" (same idea: honey is eternal)

   Two slides that cover the SAME TOPIC but DIFFERENT facts are NOT duplicates:
   - "Octopuses have 3 hearts" ≠ "Octopuses can taste with their arms" (different facts)

5. DETECT CATEGORY COLLISIONS: Flag pairs where BOTH slides fall into the same category. One collision is acceptable; two or more is not.

6. RECOMMEND ORDER: Sort the fact slides by novelty (simplest/most intuitive → strongest/most memorable). Return the slideNumbers in recommended order.

Return JSON matching this exact structure:
{
  "facts": [
    { "slideNumber": N, "category": "...", "coreClaim": "...", "noveltyScore": N }
  ],
  "semanticDuplicates": [
    { "slideA": N, "slideB": N, "sharedIdea": "what both slides are really saying" }
  ],
  "categoryCollisions": [
    { "slideA": N, "slideB": N, "category": "..." }
  ],
  "recommendedOrder": [N, N, N, N],
  "escalationOk": true/false
}

IMPORTANT:
- slideNumbers are 0-indexed (matching the input)
- semanticDuplicates should ONLY contain genuine same-idea pairs, not merely related facts
- recommendedOrder must contain exactly ${facts.length} slideNumbers
- escalationOk is true only if the CURRENT order already goes from least to most novel`;
}

// ─── Rewrite Prompt (Context-Aware) ─────────────────────────

function buildContextAwareRewritePrompt(
  slideToRewrite: GeneratedSlideV2,
  allSlides: GeneratedSlideV2[],
  topic: string,
  hookHeadline: string,
  issue: NarrativeIssue,
  analysis: NarrativeAnalysisType,
  usedCategories: string[],
): string {
  const carouselContext = allSlides
    .map(s => {
      const factInfo = analysis.facts.find(f => f.slideNumber === s.slideNumber);
      return `  Slide ${s.slideNumber + 1} (${s.role}${factInfo ? `, category: ${factInfo.category}, novelty: ${factInfo.noveltyScore}/10` : ''}):
    headline: "${s.headline}"
    core: ${factInfo?.coreClaim || s.headline}`;
    })
    .join('\n');

  const availableCategories = [
    'classification', 'behavior', 'biology', 'perception',
    'scale', 'comparison', 'mechanism', 'history', 'consequence',
  ].filter(c => !usedCategories.includes(c));

  const slidePosition = allSlides
    .filter(s => s.role === 'FACT')
    .findIndex(s => s.slideNumber === slideToRewrite.slideNumber);
  const positionLabel = ['simplest/most intuitive', 'more surprising', 'more counterintuitive', 'strongest/most memorable'][slidePosition] || 'a strong fact';

  return `You are rewriting a FACT slide because it failed narrative coherence review.

TOPIC: "${topic}"
HOOK: "${hookHeadline}"
ISSUE: ${issue.type} — ${issue.detail}

FULL CAROUSEL CONTEXT (your rewrite must improve the SET, not just the slide):
${carouselContext}

SLIDE TO REPLACE: Slide ${slideToRewrite.slideNumber + 1}
  Current headline: "${slideToRewrite.headline}"
  Current body: "${slideToRewrite.body}"

NARRATIVE POSITION: This is FACT slot ${slidePosition + 1}/4 — it should be the ${positionLabel} fact.
TARGET NOVELTY: ${slidePosition === 0 ? '3-5' : slidePosition === 1 ? '5-7' : slidePosition === 2 ? '6-8' : '8-10'}/10

CONSTRAINTS:
- Write about a COMPLETELY DIFFERENT aspect of "${topic}" than the rejected slide
- Must fall into one of these UNUSED categories: ${availableCategories.join(', ') || 'any (all used — pick the least represented)'}
- Must NOT express the same underlying idea as any other slide
- headline: 20–100 chars, specific factual claim with a number, entity, or comparison
- body: 200–400 chars, must include at least ONE number or named entity
- Must be independently valuable (screenshot test)
- No vague framing: no "interesting", "surprising", "most people don't know"

Return JSON:
{
  "headline": "...",
  "body": "...",
  "supportingDetail": "..." or null,
  "factType": "one of: statistic, comparison, mechanism, historical, example, definition",
  "containsNumber": true/false,
  "concretenessScore": 1-5,
  "noveltyScore": 1-5,
  "topicEntity": "specific entity name" or null
}`;
}

// ─── Main Gate ──────────────────────────────────────────────

export async function runNarrativeCoherenceGate(
  slides: GeneratedSlideV2[],
  compressedSlides: CompressedSlideDisplay[],
  topic: string,
  hookHeadline: string,
  ai: AIProvider,
  layout?: 'DETAILED' | 'BOLD',
): Promise<NarrativeGateResult> {
  const facts = slides.filter(s => s.role === 'FACT');

  // Skip if fewer than 2 FACTs (nothing to compare)
  if (facts.length < 2) {
    console.log('[NarrativeGate] < 2 FACT slides — skipping');
    return { slides, compressedSlides, issues: [], rewriteCount: 0, reorderApplied: false };
  }

  // ── 1. LLM Analysis ─────────────────────────────────────

  let analysis: NarrativeAnalysisType;
  try {
    const prompt = buildAnalysisPrompt(facts, topic);
    const { data } = await ai.generateObject(prompt, NarrativeAnalysis);
    analysis = data;
    console.log(`[NarrativeGate] Analysis complete: ${analysis.semanticDuplicates.length} duplicates, ${analysis.categoryCollisions.length} collisions, escalationOk=${analysis.escalationOk}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[NarrativeGate] Analysis failed: ${msg} — passing through unchanged`);
    return { slides, compressedSlides, issues: [], rewriteCount: 0, reorderApplied: false };
  }

  // ── 2. Collect issues ───────────────────────────────────

  const issues: NarrativeIssue[] = [];

  for (const dup of analysis.semanticDuplicates) {
    issues.push({
      type: 'SEMANTIC_DUPLICATE',
      slideIndices: [dup.slideA, dup.slideB],
      detail: `Slides ${dup.slideA + 1} & ${dup.slideB + 1} express the same idea: "${dup.sharedIdea}"`,
    });
  }

  // Only flag category collisions beyond the first (one overlap is tolerable)
  if (analysis.categoryCollisions.length >= 2) {
    for (const col of analysis.categoryCollisions.slice(1)) {
      issues.push({
        type: 'SAME_CATEGORY',
        slideIndices: [col.slideA, col.slideB],
        detail: `Slides ${col.slideA + 1} & ${col.slideB + 1} both in category "${col.category}"`,
      });
    }
  }

  if (!analysis.escalationOk) {
    issues.push({
      type: 'FLAT_ESCALATION',
      slideIndices: facts.map(f => f.slideNumber),
      detail: `FACT order doesn't escalate from simplest to strongest. Recommended: [${analysis.recommendedOrder.map(n => n + 1).join(', ')}]`,
    });
  }

  if (issues.length === 0) {
    console.log(`[NarrativeGate] All checks passed — no narrative issues`);
    return { slides, compressedSlides, issues: [], rewriteCount: 0, reorderApplied: false };
  }

  console.warn(`[NarrativeGate] Found ${issues.length} narrative issues:`);
  for (const issue of issues) {
    console.warn(`  ${issue.type}: ${issue.detail}`);
  }

  // ── 3. Determine actions ────────────────────────────────
  //
  // Priority:
  //   1. Rewrite semantic duplicates (always rewrite the LATER slide)
  //   2. Rewrite category collisions (rewrite the LOWER-novelty slide)
  //   3. Reorder for escalation (if no rewrites needed)

  const updatedSlides = [...slides];
  let rewriteCount = 0;
  let reorderApplied = false;

  // Track which slides we've already decided to rewrite
  const rewriteTargets = new Set<number>();

  // 3a. Semantic duplicates — rewrite the later slide
  for (const dup of analysis.semanticDuplicates) {
    const target = Math.max(dup.slideA, dup.slideB);
    if (rewriteTargets.has(target)) continue;
    rewriteTargets.add(target);
  }

  // 3b. Category collisions (beyond the first) — rewrite the lower-novelty slide
  if (analysis.categoryCollisions.length >= 2) {
    for (const col of analysis.categoryCollisions.slice(1)) {
      const aNovelty = analysis.facts.find(f => f.slideNumber === col.slideA)?.noveltyScore ?? 5;
      const bNovelty = analysis.facts.find(f => f.slideNumber === col.slideB)?.noveltyScore ?? 5;
      const target = aNovelty <= bNovelty ? col.slideA : col.slideB;
      if (rewriteTargets.has(target)) continue;
      rewriteTargets.add(target);
    }
  }

  // Cap at 2 rewrites per gate run
  const rewriteList = [...rewriteTargets].slice(0, 2);

  // ── 4. Execute rewrites ─────────────────────────────────

  // Build used-categories list (excluding slides being rewritten)
  const categoriesInUse = analysis.facts
    .filter(f => !rewriteList.includes(f.slideNumber))
    .map(f => f.category);

  for (const slideNum of rewriteList) {
    const slide = updatedSlides.find(s => s.slideNumber === slideNum);
    if (!slide || slide.role !== 'FACT') continue;

    const relevantIssue = issues.find(i => i.slideIndices.includes(slideNum))
      ?? { type: 'SEMANTIC_DUPLICATE' as const, slideIndices: [slideNum], detail: 'Narrative issue' };

    const prompt = buildContextAwareRewritePrompt(
      slide,
      updatedSlides,
      topic,
      hookHeadline,
      relevantIssue,
      analysis,
      categoriesInUse,
    );

    try {
      const { RewrittenSlide: RewrittenSlideSchema } = await import('@/lib/validation/schemas');
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
        console.log(`[NarrativeGate] Rewrote slide ${slideNum + 1}: "${slide.headline.slice(0, 40)}..." → "${rewritten.headline.slice(0, 40)}..."`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[NarrativeGate] REWRITE FAILED for slide ${slideNum + 1}: ${msg}`);
      console.error(`[NarrativeGate] Original kept — slide ${slideNum + 1} still has narrative issue: ${relevantIssue.type}`);
    }
  }

  // ── 5. Reorder for narrative escalation ─────────────────
  //
  // Only reorder if:
  //   - escalation was flagged
  //   - we have a valid recommended order
  //   - we haven't rewritten too many slides (reorder works on final content)

  if (
    !analysis.escalationOk
    && analysis.recommendedOrder.length === facts.length
    && rewriteCount <= 1 // Don't reorder if heavy rewrites happened — content changed
  ) {
    const factSlideNums = facts.map(f => f.slideNumber);
    const recOrder = analysis.recommendedOrder;

    // Validate recommended order contains the right slideNumbers
    const isValidOrder = recOrder.length === factSlideNums.length
      && recOrder.every(n => factSlideNums.includes(n))
      && new Set(recOrder).size === recOrder.length;

    if (isValidOrder) {
      // Check if current order differs from recommended
      const currentOrder = factSlideNums;
      const needsReorder = currentOrder.some((n, i) => n !== recOrder[i]);

      if (needsReorder) {
        // Collect the FACT slide data in recommended order
        const reorderedFacts = recOrder.map(num =>
          updatedSlides.find(s => s.slideNumber === num)!
        );

        // Reassign slideNumbers to maintain position 1-4
        for (let i = 0; i < reorderedFacts.length; i++) {
          const targetSlideNum = factSlideNums[i]; // position in the carousel
          const sourceSlide = reorderedFacts[i];

          const idx = updatedSlides.findIndex(s => s.slideNumber === sourceSlide.slideNumber);
          if (idx !== -1) {
            updatedSlides[idx] = { ...updatedSlides[idx], slideNumber: targetSlideNum };
          }
        }

        // Re-sort by slideNumber to ensure consistent ordering
        updatedSlides.sort((a, b) => a.slideNumber - b.slideNumber);
        reorderApplied = true;

        console.log(`[NarrativeGate] Reordered FACTs: [${currentOrder.map(n => n + 1).join(', ')}] → [${recOrder.map(n => n + 1).join(', ')}]`);
        issues.push({
          type: 'WRONG_ORDER',
          slideIndices: factSlideNums,
          detail: `Reordered: [${currentOrder.map(n => n + 1).join(', ')}] → [${recOrder.map(n => n + 1).join(', ')}]`,
        });
      }
    }
  }

  // ── 6. Re-compress if anything changed ──────────────────

  let updatedCompressed = [...compressedSlides];

  if (rewriteCount > 0 || reorderApplied) {
    try {
      const compressResult = await compressSlides(
        { topic, slides: updatedSlides, layout },
        ai,
      );
      updatedCompressed = compressResult.compressed;
    } catch {
      console.warn(`[NarrativeGate] Re-compress failed — using fallback truncation`);
      updatedCompressed = updatedSlides.map(s => ({
        slideNumber: s.slideNumber,
        displayTitle: s.headline.slice(0, 60),
        displaySupport: s.body.slice(0, 80),
      }));
    }
  }

  console.log(`[NarrativeGate] Complete: ${issues.length} issues, ${rewriteCount} rewrites, reorder=${reorderApplied}`);

  return {
    slides: updatedSlides,
    compressedSlides: updatedCompressed,
    issues,
    rewriteCount,
    reorderApplied,
  };
}
