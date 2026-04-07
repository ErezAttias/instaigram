import type { MinedFact } from '@/lib/validation/schemas';

/** Default number of facts to select for a carousel (slides 1-4). */
const DEFAULT_SELECT_COUNT = 4;

/** Minimum number of facts with has_number = true in the final selection. */
const MIN_NUMBER_FACTS = 2;

export interface SelectResult {
  /** The selected facts, ordered for carousel composition. */
  selected: MinedFact[];
  /** Total candidates that were considered. */
  consideredCount: number;
  /** Number of facts with has_number in the selection. */
  numberFactCount: number;
}

/**
 * Step 4: SELECT — Pick the best facts and order them for composition.
 *
 * Deterministic. No LLM call.
 *
 * 1. Score each candidate on a composite of structural signals.
 * 2. Sort by score descending.
 * 3. Apply diversity constraints (no duplicate entity sets, number minimum).
 * 4. Take the top N.
 * 5. Order for carousel: highest-surprise first, most-concrete last
 *    (to set up the implication slide).
 */
export function selectFacts(
  candidates: MinedFact[],
  count: number = DEFAULT_SELECT_COUNT,
): SelectResult {
  if (candidates.length === 0) {
    console.warn('[select] No candidates to select from');
    return { selected: [], consideredCount: 0, numberFactCount: 0 };
  }

  // If we have fewer candidates than requested, use them all
  const targetCount = Math.min(count, candidates.length);

  // Step 1: Score each candidate
  const scored = candidates.map((fact, originalIndex) => ({
    fact,
    originalIndex,
    score: scoreFact(fact),
  }));

  // Step 2: Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Step 3: Apply diversity constraints via greedy selection
  const selected: MinedFact[] = [];
  const usedEntitySets: string[][] = [];
  let numberFactCount = 0;

  for (const entry of scored) {
    if (selected.length >= targetCount) break;

    // Diversity check: skip if entity set is identical to an already-selected fact
    if (hasIdenticalEntitySet(entry.fact, usedEntitySets)) {
      continue;
    }

    selected.push(entry.fact);
    usedEntitySets.push(entry.fact.entities.map(e => e.toLowerCase()));
    if (entry.fact.has_number) numberFactCount++;
  }

  // Step 3b: If we don't have enough number facts, try to swap in from remaining
  if (numberFactCount < MIN_NUMBER_FACTS && selected.length >= targetCount) {
    backfillNumberFacts(selected, scored, usedEntitySets, MIN_NUMBER_FACTS - numberFactCount);
    numberFactCount = selected.filter(f => f.has_number).length;
  }

  // Step 4: Order for carousel composition
  orderForCarousel(selected);

  console.log(
    `[select] ${candidates.length} candidates → ${selected.length} selected ` +
    `(${numberFactCount} with numbers)`
  );

  return {
    selected,
    consideredCount: candidates.length,
    numberFactCount,
  };
}

/**
 * Score a single fact based on structural signals.
 *
 * This is NOT a quality judgment (that's the LLM's job in the ranking step
 * of the full pipeline). This is a structural preference score based on
 * objectively measurable features.
 */
function scoreFact(fact: MinedFact): number {
  let score = 0;

  // Numbers make facts more concrete and shareable
  if (fact.has_number) score += 3;

  // Comparisons create natural tension (good for carousels)
  if (fact.has_comparison) score += 2;

  // More entities = more specific = better
  score += Math.min(fact.entities.length, 3); // cap at 3 to avoid entity-stuffing

  // Longer evidence suggests more substantive detail (diminishing returns)
  if (fact.evidence.length >= 100) score += 2;
  else if (fact.evidence.length >= 50) score += 1;

  // Grounded facts have been externally verified
  if (fact.source_type === 'grounded') score += 1;

  return score;
}

/**
 * Check if a fact's entity set is identical to any already-selected entity set.
 * Two facts about the exact same set of entities are likely redundant
 * even if they passed the dedupe step.
 */
function hasIdenticalEntitySet(
  fact: MinedFact,
  usedEntitySets: string[][],
): boolean {
  if (fact.entities.length === 0) return false;

  const normalized = new Set(fact.entities.map(e => e.toLowerCase()));

  for (const used of usedEntitySets) {
    if (used.length !== normalized.size) continue;

    const usedSet = new Set(used);
    const allMatch = [...normalized].every(e => usedSet.has(e));
    if (allMatch) return true;
  }

  return false;
}

/**
 * Try to swap in number-bearing facts to meet the minimum.
 *
 * Finds the lowest-scoring non-number fact in the selection and swaps it
 * with the highest-scoring unused number fact. Repeats until the minimum
 * is met or no more swaps are possible.
 */
function backfillNumberFacts(
  selected: MinedFact[],
  allScored: Array<{ fact: MinedFact; score: number }>,
  usedEntitySets: string[][],
  needed: number,
): void {
  // Find unused number facts (not already in selection)
  const unusedNumberFacts = allScored.filter(
    entry => entry.fact.has_number && !selected.includes(entry.fact)
  );

  if (unusedNumberFacts.length === 0) return;

  let swapped = 0;

  for (const candidate of unusedNumberFacts) {
    if (swapped >= needed) break;
    if (hasIdenticalEntitySet(candidate.fact, usedEntitySets)) continue;

    // Find the weakest non-number fact in the current selection
    let weakestIdx = -1;
    let weakestScore = Infinity;
    for (let i = 0; i < selected.length; i++) {
      if (selected[i].has_number) continue; // don't swap out number facts
      const s = scoreFact(selected[i]);
      if (s < weakestScore) {
        weakestScore = s;
        weakestIdx = i;
      }
    }

    if (weakestIdx === -1) break; // no non-number facts left to swap

    // Only swap if the candidate is at least as strong
    if (candidate.score >= weakestScore) {
      // Update entity tracking
      usedEntitySets[weakestIdx] = candidate.fact.entities.map(e => e.toLowerCase());
      selected[weakestIdx] = candidate.fact;
      swapped++;
    }
  }
}

/**
 * Order selected facts for carousel composition.
 *
 * Strategy:
 * - Lead with the most surprising/comparison-heavy fact (grabs attention after opener)
 * - End with the most concrete/number-heavy fact (sets up implication)
 * - Middle facts ordered by score descending
 *
 * Mutates the array in place.
 */
function orderForCarousel(selected: MinedFact[]): void {
  if (selected.length <= 2) return;

  // Score each fact for "lead" potential (surprise/comparison) vs "anchor" potential (concreteness)
  const leadScores = selected.map((f, i) => ({
    index: i,
    lead: (f.has_comparison ? 3 : 0) + (f.entities.length >= 2 ? 2 : 0),
    anchor: (f.has_number ? 3 : 0) + (f.evidence.length >= 100 ? 2 : 0),
  }));

  // Pick the best lead (highest lead score, break ties by more entities)
  let bestLeadIdx = 0;
  for (let i = 1; i < leadScores.length; i++) {
    if (
      leadScores[i].lead > leadScores[bestLeadIdx].lead ||
      (leadScores[i].lead === leadScores[bestLeadIdx].lead &&
        selected[i].entities.length > selected[bestLeadIdx].entities.length)
    ) {
      bestLeadIdx = i;
    }
  }

  // Pick the best anchor (highest anchor score), excluding the lead
  let bestAnchorIdx = bestLeadIdx === 0 ? 1 : 0;
  for (let i = 0; i < leadScores.length; i++) {
    if (i === bestLeadIdx) continue;
    if (
      leadScores[i].anchor > leadScores[bestAnchorIdx].anchor ||
      (leadScores[i].anchor === leadScores[bestAnchorIdx].anchor &&
        selected[i].evidence.length > selected[bestAnchorIdx].evidence.length)
    ) {
      bestAnchorIdx = i;
    }
  }

  // Build the ordered array: lead first, anchor last, rest in original order
  const lead = selected[bestLeadIdx];
  const anchor = selected[bestAnchorIdx];
  const middle = selected.filter((_, i) => i !== bestLeadIdx && i !== bestAnchorIdx);

  selected.length = 0;
  selected.push(lead, ...middle, anchor);
}
