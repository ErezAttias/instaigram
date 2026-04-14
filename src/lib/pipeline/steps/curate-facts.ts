/**
 * Curate Facts — LLM-Enhanced Fact Selection
 *
 * Replaces the deterministic selectFacts() with an intelligent selection
 * that evaluates each candidate on:
 *   - Impact (emotional reaction, vividness, memorability) — HIGHEST WEIGHT
 *   - Novelty (how surprising/counterintuitive)
 *   - Clarity (how easy to explain in one slide)
 *   - Visual potential (can be shown, not just told)
 *   - Conceptual category (behavior, biology, perception, etc.)
 *
 * Then selects exactly 4 facts with:
 *   - Hard impact filter (reject < 6 when pool allows)
 *   - Category diversity (no two facts in the same category)
 *   - Escalating order (simplest → strongest)
 *
 * One LLM call evaluates, then deterministic selection picks the best 4.
 */

import type { AIProvider } from '@/lib/ai/types';
import type { MinedFact } from '@/lib/validation/schemas';
import { z } from 'zod';

// ─── Types ──────────────────────────────────────────────────

const FactCategory = z.enum([
  'classification',
  'behavior',
  'biology',
  'perception',
  'scale',
  'comparison',
  'mechanism',
  'history',
  'consequence',
]);

const ScoredCandidate = z.object({
  index: z.number(),
  category: FactCategory,
  impact: z.number().min(1).max(10),
  novelty: z.number().min(1).max(10),
  clarity: z.number().min(1).max(10),
  visualPotential: z.number().min(1).max(10),
  dramaticEvent: z.boolean(),
  rejection: z.string().nullable(),
});

const CurationAnalysis = z.object({
  candidates: z.array(ScoredCandidate),
});

type ScoredCandidateType = z.infer<typeof ScoredCandidate>;

export interface CurateResult {
  /** The 4 selected facts, ordered by escalation (simplest → strongest). */
  selected: MinedFact[];
  /** All scored candidates (for debugging/tracing). */
  scoredPool: Array<{
    fact: MinedFact;
    category: string;
    impact: number;
    novelty: number;
    clarity: number;
    visualPotential: number;
    compositeScore: number;
    selected: boolean;
    rejected: boolean;
    rejectionReason: string | null;
  }>;
  /** Total candidates considered. */
  consideredCount: number;
  /** Number of facts with has_number in the selection. */
  numberFactCount: number;
}

// ─── Analysis Prompt ────────────────────────────────────────

function buildCurationPrompt(
  candidates: MinedFact[],
  topic: string,
  hookText: string,
  angleDescription?: string,
): string {
  const candidateBlock = candidates
    .map((f, i) => `[${i}] claim: "${f.claim}"
  evidence: "${f.evidence}"
  entities: [${f.entities.join(', ')}]
  has_number: ${f.has_number}, has_comparison: ${f.has_comparison}
  source: ${f.source_type}`)
    .join('\n\n');

  const angleBlock = angleDescription ? `
═══════════════════════════════════════════
CAROUSEL ANGLE (mandatory filter)
═══════════════════════════════════════════

This carousel answers ONE question: "${angleDescription}"

Before scoring any fact, ask: does it help answer THIS specific question?
  ✓ YES → score normally
  ✗ NO (it's just interesting trivia about "${topic}", not serving this angle) → set rejection="OFF_ANGLE: <why>"

Off-angle facts are rejected regardless of impact or novelty. A fact scoring 9 for impact
but unrelated to "${angleDescription}" still gets rejected — it belongs in a different carousel.

Example (angle: "Why Titanic's wreck footage was used in the film"):
  ✓ ON-ANGLE: "Cameron dived 12 times to film the wreck himself"
  ✗ OFF-ANGLE: "Titanic movie cost more to make than the actual ship" — true but doesn't answer the question

Be strict. Better to reject 10 good-but-off-angle facts than let one dilute the carousel.
` : '';

  return `You are evaluating ${candidates.length} candidate facts about "${topic}" for an Instagram carousel.
Hook: "${hookText}"
${angleBlock}
CANDIDATES:
${candidateBlock}

EVALUATE each candidate on FOUR dimensions (1-10):

═══════════════════════════════════════════
IMPACT (1-10) — THE MOST IMPORTANT DIMENSION
═══════════════════════════════════════════

Impact measures: would someone STOP scrolling, say "wait, what?", and remember this fact tomorrow?

  1-3 = forgettable — correct but no one cares ("bees pollinate flowers")
  4-5 = mildly interesting — could be in a textbook ("honey has antibacterial properties")
  6-7 = compelling — makes someone pause and think ("a single bee produces 1/12 teaspoon of honey in its lifetime")
  8-9 = visceral — creates a strong mental image or emotional reaction ("an octopus arm can taste food and act on its own — even after being severed")
  10 = unforgettable — someone will repeat this at dinner tonight ("Athena was born fully armored from Zeus's split skull")

The test: imagine reading this fact on an Instagram slide. Do you:
  - Swipe past? → 1-4
  - Pause and read? → 5-6
  - Screenshot it? → 7-8
  - Send it to a friend? → 9-10

STRONG IMPACT facts are:
  ✓ "Athena was born fully armored from Zeus's split skull" — visceral image, unforgettable
  ✓ "Some octopus arms can act independently after being severed" — bizarre, vivid, makes you go "wait, what?"
  ✓ "Cerberus was originally described with 50 heads, not 3" — contradicts what everyone thinks they know
  ✓ "A mantis shrimp punches so fast it boils the water around its fist" — specific, vivid, almost unbelievable

WEAK IMPACT facts are:
  ✗ "Greek myths influenced Western literature" — vague, abstract, no one screenshots this
  ✗ "There are 12 Olympian gods" — common knowledge, no reaction
  ✗ "Dogs are loyal animals" — generic, expected, boring
  ✗ "The ocean is very deep" — true but who cares?

═══════════════════════════════════════════

NOVELTY (1-10):
  1-3 = commonly known, obvious, or boring
  4-5 = somewhat interesting but expected
  6-7 = genuinely surprising — would make someone pause
  8-9 = counterintuitive — contradicts common belief
  10 = mind-blowing — paradigm-shifting

CLARITY (1-10):
  1-3 = requires heavy explanation, abstract, hard to grasp
  4-5 = understandable but needs context
  6-7 = clear with minimal setup
  8-10 = instantly graspable in one sentence

VISUAL POTENTIAL (1-10):
  1-3 = purely abstract concept, impossible to visualize
  4-5 = can be loosely illustrated with a generic image
  6-7 = has a clear visual subject (animal, object, place, scene)
  8-10 = strongly visual — evokes a specific image instantly

DRAMATIC EVENT (true/false) — THE CRITICAL FILTER
═══════════════════════════════════════════

A fact is a DRAMATIC EVENT (true) if it describes:
  - A specific thing that HAPPENED (not just a trait or ability)
  - With STAKES (something was at risk — a life, a status, a relationship)
  - And a CONSEQUENCE (death, transformation, punishment, irreversible change)

Set to TRUE if the fact includes:
  ✓ "Ares disguised himself as a boar to kill Adonis" — event + stakes + death
  ✓ "Hera tricked Semele into demanding Zeus's true form, which killed her" — event + deception + death
  ✓ "Dionysus turned into a lion on a pirate ship; the pirates leapt into the sea and became dolphins" — event + transformation + consequence
  ✓ "Athena was born fully armored from Zeus's split skull" — event + visceral moment

Set to FALSE if the fact is:
  ✗ "Hades wore the Helm of Darkness to remain unseen" — ability/trait, no specific event
  ✗ "Apollo was the god of music, poetry, and prophecy" — description, no stakes
  ✗ "Zeus could shapeshift into many forms" — capability, not an event
  ✗ "The Underworld had three judges" — classification, nothing happened

The test: Can you answer "what happened?" with a specific event?
  - If the answer is "something happened TO someone" → TRUE
  - If the answer is "X could do Y" or "X was known for Y" → FALSE

═══════════════════════════════════════════

CATEGORY — classify each into exactly ONE:
  classification, behavior, biology, perception, scale, comparison, mechanism, history, consequence

REJECTION — set to a reason string if the fact should be rejected, null otherwise.
Reject facts that are:
  - Weak trivia with no surprise ("dogs have four legs")
  - Too abstract to explain visually ("consciousness is complex")
  - Requires multi-step explanation to understand
  - Common knowledge dressed up as surprising
  - General/educational without a specific hook ("X is important")
  - Unverifiable or likely false
${angleDescription ? `  - OFF-ANGLE: doesn't serve "${angleDescription}" (prefix reason with "OFF_ANGLE: ...")` : ''}

Return JSON:
{
  "candidates": [
    { "index": 0, "category": "...", "impact": N, "novelty": N, "clarity": N, "visualPotential": N, "dramaticEvent": true/false, "rejection": null or "reason" },
    ...
  ]
}

IMPORTANT:
- Evaluate ALL ${candidates.length} candidates
- index must match the candidate number [0], [1], etc.
- Be HARSH on impact — most facts are 3-5, not 7-10
- Instagram users have seen everything. Only the genuinely striking facts deserve 7+
- A fact can be novel (counterintuitive) but low-impact (boring delivery). Score them independently.
- Prefer SPECIFIC + CONCRETE + STRANGE over GENERAL + EDUCATIONAL + EXPECTED`;
}

// ─── Deterministic Selection from Scored Pool ───────────────

/** Minimum impact score to be selectable (when enough high-impact candidates exist) */
const IMPACT_HARD_FLOOR = 6;
/** Minimum number of high-impact candidates needed to enforce the floor */
const IMPACT_FLOOR_POOL_THRESHOLD = 5;

function selectFromScoredPool(
  candidates: MinedFact[],
  scores: ScoredCandidateType[],
  targetCount: number = 4,
): { selected: MinedFact[]; scoredPool: CurateResult['scoredPool'] } {
  // Build composite scores and filter rejections
  const pool = scores.map(s => {
    const fact = candidates[s.index];
    const rejected = s.rejection !== null;

    // Composite: impact-first, novelty-second, dramatic events boosted
    const compositeScore = rejected ? -1 : (
      s.impact * 4 +          // impact is king
      s.novelty * 2.5 +       // novelty amplifies impact
      s.clarity * 1.5 +       // clarity enables the impact to land
      s.visualPotential * 1 + // visual supports but doesn't drive
      (s.dramaticEvent ? 8 : 0) + // strong boost for events with stakes
      (fact.has_number ? 2 : 0) +
      (fact.has_comparison ? 1.5 : 0) +
      (fact.source_type === 'grounded' ? 0.5 : 0)
    );

    return {
      fact,
      index: s.index,
      category: s.category,
      impact: s.impact,
      novelty: s.novelty,
      clarity: s.clarity,
      visualPotential: s.visualPotential,
      compositeScore,
      rejected,
      rejectionReason: s.rejection,
      selected: false,
    };
  });

  // Sort by composite score descending
  const viable = [...pool]
    .filter(p => !p.rejected)
    .sort((a, b) => b.compositeScore - a.compositeScore);

  // ── Hard impact filter ──────────────────────────────────
  // If enough high-impact candidates exist, reject anything below the floor
  const highImpactCount = viable.filter(p => p.impact >= IMPACT_HARD_FLOOR).length;
  const applyImpactFloor = highImpactCount >= IMPACT_FLOOR_POOL_THRESHOLD;

  const ranked = applyImpactFloor
    ? viable.filter(p => p.impact >= IMPACT_HARD_FLOOR)
    : viable;

  if (applyImpactFloor) {
    const filtered = viable.length - ranked.length;
    if (filtered > 0) {
      console.log(`[curate] Impact floor applied: ${filtered} candidates below impact ${IMPACT_HARD_FLOOR} excluded`);
    }
  }

  // ── Greedy selection: dramatic events first, then backfill ──
  const selected: typeof pool[number][] = [];

  // Pass 1: select dramatic events (with category diversity)
  const dramaticCandidates = ranked.filter(p => {
    const score = scores.find(s => s.index === p.index);
    return score?.dramaticEvent === true;
  });
  const nonDramaticCandidates = ranked.filter(p => {
    const score = scores.find(s => s.index === p.index);
    return score?.dramaticEvent !== true;
  });

  for (const candidate of dramaticCandidates) {
    if (selected.length >= targetCount) break;
    const categoryCount = selected.filter(s => s.category === candidate.category).length;
    if (categoryCount >= 2) continue;
    selected.push(candidate);
  }

  // Pass 2: backfill with non-dramatic candidates if not enough events
  if (selected.length < targetCount) {
    const backfillCount = targetCount - selected.length;
    console.log(`[curate] Only ${selected.length} dramatic events — backfilling ${backfillCount} from non-dramatic pool`);
    for (const candidate of nonDramaticCandidates) {
      if (selected.length >= targetCount) break;
      const categoryCount = selected.filter(s => s.category === candidate.category).length;
      if (categoryCount >= 2) continue;
      selected.push(candidate);
    }
  }

  // Pass 3: final backfill from all viable (relax all filters)
  if (selected.length < targetCount) {
    for (const candidate of viable) {
      if (selected.length >= targetCount) break;
      if (selected.includes(candidate)) continue;
      selected.push(candidate);
    }
  }

  // ── Order by escalation: impact ascending ───────────────
  // Simplest/lowest-impact first → strongest/highest-impact last
  selected.sort((a, b) => a.impact - b.impact);

  // Mark selected in pool
  for (const s of selected) {
    const poolEntry = pool.find(p => p.index === s.index);
    if (poolEntry) poolEntry.selected = true;
  }

  return {
    selected: selected.map(s => s.fact),
    scoredPool: pool.map(p => ({
      fact: p.fact,
      category: p.category,
      impact: p.impact,
      novelty: p.novelty,
      clarity: p.clarity,
      visualPotential: p.visualPotential,
      compositeScore: p.compositeScore,
      selected: p.selected,
      rejected: p.rejected,
      rejectionReason: p.rejectionReason,
    })),
  };
}

// ─── Main Entry Point ───────────────────────────────────────

/**
 * Curate facts: LLM evaluates all deduped candidates on impact, novelty,
 * clarity, and visual potential. Deterministic selection picks the best 4
 * with diversity + escalation. Impact is the primary selection driver.
 *
 * Falls back to the structural-only selection if LLM evaluation fails.
 */
export async function curateFacts(
  candidates: MinedFact[],
  topic: string,
  hookText: string,
  ai: AIProvider,
  options: { count?: number; angleDescription?: string } = {},
): Promise<CurateResult> {
  const count = options.count ?? 4;
  const angleDescription = options.angleDescription;
  if (candidates.length === 0) {
    console.warn('[curate] No candidates to curate');
    return { selected: [], scoredPool: [], consideredCount: 0, numberFactCount: 0 };
  }

  // If very few candidates, skip LLM evaluation — just use them all
  if (candidates.length <= count) {
    console.log(`[curate] Only ${candidates.length} candidates — using all`);
    return {
      selected: candidates,
      scoredPool: candidates.map((f) => ({
        fact: f,
        category: 'mechanism',
        impact: 5,
        novelty: 5,
        clarity: 5,
        visualPotential: 5,
        compositeScore: 0,
        selected: true,
        rejected: false,
        rejectionReason: null,
      })),
      consideredCount: candidates.length,
      numberFactCount: candidates.filter(f => f.has_number).length,
    };
  }

  // ── LLM Evaluation ──────────────────────────────────────

  let scores: ScoredCandidateType[];
  try {
    const prompt = buildCurationPrompt(candidates, topic, hookText, angleDescription);
    const { data } = await ai.generateObject(prompt, CurationAnalysis);
    scores = data.candidates;

    // Validate index coverage
    const scoredIndices = new Set(scores.map(s => s.index));
    if (scoredIndices.size < candidates.length * 0.7) {
      console.warn(`[curate] LLM only scored ${scoredIndices.size}/${candidates.length} candidates — filling gaps`);
      for (let i = 0; i < candidates.length; i++) {
        if (!scoredIndices.has(i)) {
          scores.push({
            index: i,
            category: 'mechanism',
            impact: 4,
            novelty: 5,
            clarity: 5,
            visualPotential: 5,
            dramaticEvent: false,
            rejection: null,
          });
        }
      }
    }

    const rejectedCount = scores.filter(s => s.rejection !== null).length;
    const avgImpact = scores.reduce((sum, s) => sum + s.impact, 0) / scores.length;
    const avgNovelty = scores.reduce((sum, s) => sum + s.novelty, 0) / scores.length;
    console.log(`[curate] LLM evaluated ${scores.length} candidates: ${rejectedCount} rejected, avg impact ${avgImpact.toFixed(1)}, avg novelty ${avgNovelty.toFixed(1)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[curate] LLM evaluation failed: ${msg} — falling back to structural selection`);

    // Fallback: create default scores from structural signals
    scores = candidates.map((f, i) => ({
      index: i,
      category: 'mechanism' as const,
      impact: f.has_number ? 6 : f.has_comparison ? 5 : 4,
      novelty: f.has_number ? 6 : f.has_comparison ? 5 : 4,
      clarity: f.evidence.length >= 100 ? 7 : 5,
      visualPotential: f.entities.length >= 2 ? 6 : 4,
      dramaticEvent: false, // can't determine without LLM
      rejection: null,
    }));
  }

  // ── Deterministic Selection ─────────────────────────────

  const { selected, scoredPool } = selectFromScoredPool(candidates, scores, count);

  const numberFactCount = selected.filter(f => f.has_number).length;

  // Log selection
  const selectedIndices = new Set(selected.map(s => candidates.indexOf(s)));
  const dramaticCount = scores.filter(s =>
    s.dramaticEvent && selectedIndices.has(s.index),
  ).length;
  console.log(`[curate] Selected ${selected.length}/${candidates.length} facts (${dramaticCount} dramatic events):`);
  const selectedEntries = scoredPool.filter(p => p.selected);
  for (const entry of selectedEntries) {
    const candidateIdx = candidates.indexOf(entry.fact);
    const score = scores.find(s => s.index === candidateIdx);
    const eventTag = score?.dramaticEvent ? '⚡' : '○';
    console.log(`  ${eventTag} [impact:${entry.impact} novelty:${entry.novelty} clarity:${entry.clarity} visual:${entry.visualPotential} cat:${entry.category}] "${entry.fact.claim.slice(0, 60)}..."`);
  }

  const rejectedEntries = scoredPool.filter(p => p.rejected);
  if (rejectedEntries.length > 0) {
    console.log(`  ✗ ${rejectedEntries.length} rejected:`);
    for (const entry of rejectedEntries.slice(0, 3)) {
      console.log(`    "${entry.fact.claim.slice(0, 50)}..." — ${entry.rejectionReason}`);
    }
  }

  // Log impact-filtered facts (not rejected, but below floor)
  const impactFiltered = scoredPool.filter(p => !p.rejected && !p.selected && p.impact < IMPACT_HARD_FLOOR);
  if (impactFiltered.length > 0) {
    console.log(`  ↓ ${impactFiltered.length} below impact floor (${IMPACT_HARD_FLOOR}):`);
    for (const entry of impactFiltered.slice(0, 3)) {
      console.log(`    [impact:${entry.impact}] "${entry.fact.claim.slice(0, 50)}..."`);
    }
  }

  return {
    selected,
    scoredPool,
    consideredCount: candidates.length,
    numberFactCount,
  };
}
