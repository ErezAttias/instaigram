import type { MinedFact } from '@/lib/validation/schemas';
import { jaccardSimilarity } from '@/lib/utils/similarity';

/** Similarity threshold for claim text. Above this = duplicate. */
const CLAIM_SIMILARITY_THRESHOLD = 0.5;

/** Minimum entity overlap ratio to trigger entity-based dedup. */
const ENTITY_OVERLAP_THRESHOLD = 0.75;

export interface DedupeResult {
  /** Surviving candidates after deduplication. */
  candidates: MinedFact[];
  /** Number of candidates removed. */
  removedCount: number;
}

/**
 * Step 2: DEDUPE — Remove near-duplicate facts from the candidate pool.
 *
 * Two candidates are considered duplicates if:
 *   1. Their claim text has Jaccard similarity > 0.5, OR
 *   2. They reference the same entity set (>= 75% overlap) AND
 *      their claims make the same directional assertion.
 *
 * When a duplicate pair is found, the stronger candidate is kept.
 * Strength is determined by: has_number > more entities > longer evidence.
 *
 * Purely deterministic. No LLM call. O(n²) on candidate count which is
 * fine for pools of 15-25.
 */
export function dedupeFacts(candidates: MinedFact[]): DedupeResult {
  if (candidates.length <= 1) {
    return { candidates: [...candidates], removedCount: 0 };
  }

  // Track which indices to remove (keeps the better candidate of each pair)
  const removed = new Set<number>();

  for (let i = 0; i < candidates.length; i++) {
    if (removed.has(i)) continue;

    for (let j = i + 1; j < candidates.length; j++) {
      if (removed.has(j)) continue;

      const a = candidates[i];
      const b = candidates[j];

      const isDuplicate =
        isClaimSimilar(a.claim, b.claim) ||
        isEntityDuplicate(a, b);

      if (isDuplicate) {
        // Remove the weaker one
        const weaker = pickWeaker(a, b);
        if (weaker === a) {
          removed.add(i);
          break; // i is removed, stop comparing it
        } else {
          removed.add(j);
        }
      }
    }
  }

  const surviving = candidates.filter((_, idx) => !removed.has(idx));

  console.log(
    `[dedupe] ${candidates.length} candidates → ${surviving.length} ` +
    `(removed ${removed.size} duplicates)`
  );

  return {
    candidates: surviving,
    removedCount: removed.size,
  };
}

/**
 * Check if two claim strings are similar enough to be considered duplicates.
 */
function isClaimSimilar(claimA: string, claimB: string): boolean {
  return jaccardSimilarity(claimA, claimB) > CLAIM_SIMILARITY_THRESHOLD;
}

/**
 * Check if two facts reference the same entities and make a similar assertion.
 *
 * Two facts about "Napoleon" are NOT duplicates if one is about his height
 * and another about his military strategy. They ARE duplicates if both claim
 * he wasn't actually short.
 */
function isEntityDuplicate(a: MinedFact, b: MinedFact): boolean {
  if (a.entities.length === 0 || b.entities.length === 0) return false;

  // Normalize entities for comparison
  const setA = new Set(a.entities.map(e => e.toLowerCase()));
  const setB = new Set(b.entities.map(e => e.toLowerCase()));

  // Calculate entity overlap
  let overlap = 0;
  for (const entity of setA) {
    if (setB.has(entity)) overlap++;
  }

  const smaller = Math.min(setA.size, setB.size);
  if (smaller === 0) return false;

  const overlapRatio = overlap / smaller;
  if (overlapRatio < ENTITY_OVERLAP_THRESHOLD) return false;

  // Entities overlap heavily — now check if the claims are directionally similar.
  // Use a lower Jaccard threshold since we already know they're about the same thing.
  return jaccardSimilarity(a.claim, b.claim) > 0.3;
}

/**
 * Given two duplicate candidates, return the weaker one (to be removed).
 *
 * Preference order:
 *   1. Keep the one with has_number = true
 *   2. Keep the one with more entities
 *   3. Keep the one with longer evidence
 */
function pickWeaker(a: MinedFact, b: MinedFact): MinedFact {
  // Prefer the one with a number
  if (a.has_number && !b.has_number) return b;
  if (b.has_number && !a.has_number) return a;

  // Prefer the one with more entities
  if (a.entities.length !== b.entities.length) {
    return a.entities.length > b.entities.length ? b : a;
  }

  // Prefer the one with longer evidence (more detail)
  if (a.evidence.length !== b.evidence.length) {
    return a.evidence.length > b.evidence.length ? b : a;
  }

  // Tie — remove the later one
  return b;
}
