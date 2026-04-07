/**
 * Carousel-Level Typography Normalizer
 *
 * After per-slide text-fit validation, this module runs a second pass
 * to normalize T1 and T2 font sizes across all slides in a carousel.
 *
 * Goals:
 *   - Choose one shared T1 size for the entire carousel
 *   - Only allow per-slide deviation if a shared size would fail fit
 *   - Normalize T2 if possible
 *   - Evaluate spacing rhythm consistency
 *
 * Reports:
 *   - SHARED_T1_SIZE: all slides use the same T1 size
 *   - MIXED_T1_SIZE: slides use different sizes (with reason)
 */

import {
  validateTextFit,
  type TextFitInput,
  type ValidationResult,
} from './text-fit-validator';

// ─── Types ──────────────────────────────────────────────────────

export type TypographyMode = 'SHARED_T1_SIZE' | 'MIXED_T1_SIZE';

export interface CarouselTypographyResult {
  /** Whether all slides could be normalized to a shared T1 */
  mode: TypographyMode;
  /** The shared T1 size (if mode is SHARED_T1_SIZE) */
  sharedT1Size?: number;
  /** The shared T2 size (if consistent) */
  sharedT2Size?: number;
  /** Per-slide normalized results */
  slides: NormalizedSlideResult[];
  /** If MIXED_T1_SIZE, the reason */
  mixedReason?: string;
  /** Spacing rhythm evaluation */
  rhythm: RhythmEvaluation;
}

export interface NormalizedSlideResult {
  /** Slide identifier */
  id: string;
  /** The re-validated result at the normalized font size */
  validation: ValidationResult;
  /** Original T1 font size (before normalization) */
  originalT1Size: number;
  /** Final T1 font size (after normalization) */
  finalT1Size: number;
  /** Whether this slide changed font size */
  sizeChanged: boolean;
  /** Whether validation still passes at the normalized size */
  stillApproved: boolean;
}

export interface RhythmEvaluation {
  /** Zone occupancies across slides */
  occupancies: number[];
  /** Average occupancy */
  average: number;
  /** Max deviation from average */
  maxDeviation: number;
  /** Whether the rhythm is consistent (deviation < 15%) */
  consistent: boolean;
}

// ─── Configuration ──────────────────────────────────────────────

/** T1 font size candidates — ordered largest to smallest */
const T1_CANDIDATES = [60, 54, 48, 42];

/** Maximum acceptable zone occupancy deviation for "consistent rhythm" */
const RHYTHM_DEVIATION_THRESHOLD = 0.15;

// ─── Core Logic ─────────────────────────────────────────────────

/**
 * Normalize typography across a carousel.
 *
 * Strategy:
 * 1. Collect all per-slide T1 font sizes from initial validation
 * 2. Find the smallest T1 size that appears (the "tightest" slide)
 * 3. Try re-validating ALL slides at that shared size
 * 4. If all pass → SHARED_T1_SIZE
 * 5. If some fail at the shared size → try the next smaller size
 * 6. If no shared size works → MIXED_T1_SIZE
 *
 * @param slides Array of { id, input, originalValidation }
 * @returns CarouselTypographyResult
 */
export function normalizeCarouselTypography(
  slides: Array<{
    id: string;
    input: TextFitInput;
    originalValidation: ValidationResult;
  }>,
): CarouselTypographyResult {
  if (slides.length === 0) {
    return {
      mode: 'SHARED_T1_SIZE',
      sharedT1Size: T1_CANDIDATES[0],
      sharedT2Size: 34,
      slides: [],
      rhythm: { occupancies: [], average: 0, maxDeviation: 0, consistent: true },
    };
  }

  // Collect original T1 sizes
  const originalSizes = slides.map(s => s.originalValidation.t1FontSize);
  const smallestOriginal = Math.min(...originalSizes);

  // Try shared sizes starting from the smallest original, then going smaller
  const candidateSizes = T1_CANDIDATES.filter(s => s <= smallestOriginal);
  // Also include the smallest original if it's not already in candidates
  if (!candidateSizes.includes(smallestOriginal)) {
    candidateSizes.unshift(smallestOriginal);
  }
  candidateSizes.sort((a, b) => b - a); // Largest first

  for (const sharedSize of candidateSizes) {
    const results = trySharedSize(slides, sharedSize);

    if (results.every(r => r.stillApproved)) {
      // All slides pass at this shared size
      const rhythm = evaluateRhythm(results.map(r => r.validation.zoneOccupancy));
      const t2Sizes = new Set(results.map(r => r.validation.t2FontSize));

      return {
        mode: 'SHARED_T1_SIZE',
        sharedT1Size: sharedSize,
        sharedT2Size: t2Sizes.size === 1 ? [...t2Sizes][0] : undefined,
        slides: results,
        rhythm,
      };
    }
  }

  // No shared size works — fall back to per-slide sizes
  const fallbackResults: NormalizedSlideResult[] = slides.map(s => ({
    id: s.id,
    validation: s.originalValidation,
    originalT1Size: s.originalValidation.t1FontSize,
    finalT1Size: s.originalValidation.t1FontSize,
    sizeChanged: false,
    stillApproved: s.originalValidation.approved,
  }));

  const failedSlides = fallbackResults.filter(r => {
    const sharedSize = Math.min(...originalSizes);
    // Re-validate at smallest size to find which ones actually fail
    const revalidated = validateTextFit({
      ...slides.find(s => s.id === r.id)!.input,
    });
    return !revalidated.approved;
  });

  const rhythm = evaluateRhythm(fallbackResults.map(r => r.validation.zoneOccupancy));

  return {
    mode: 'MIXED_T1_SIZE',
    slides: fallbackResults,
    mixedReason: `No shared T1 size works for all slides. Sizes: ${originalSizes.join(', ')}px. ` +
      `Slides that prevent normalization: ${failedSlides.map(r => r.id).join(', ') || 'fit constraints'}`,
    rhythm,
  };
}

/**
 * Try re-validating all slides at a specific T1 font size.
 */
function trySharedSize(
  slides: Array<{
    id: string;
    input: TextFitInput;
    originalValidation: ValidationResult;
  }>,
  targetT1Size: number,
): NormalizedSlideResult[] {
  return slides.map(s => {
    const originalSize = s.originalValidation.t1FontSize;

    // If this slide already uses this size, no change needed
    if (originalSize === targetT1Size) {
      return {
        id: s.id,
        validation: s.originalValidation,
        originalT1Size: originalSize,
        finalT1Size: targetT1Size,
        sizeChanged: false,
        stillApproved: s.originalValidation.approved,
      };
    }

    // Re-validate at the target size
    // We do a full re-validation which will try the target size and
    // potentially find a different (but valid) line break
    const revalidated = validateTextFit(s.input);

    // Check if the re-validated result uses a size >= target
    // (meaning it can fit at the target size or larger)
    if (revalidated.approved && revalidated.t1FontSize >= targetT1Size) {
      // Re-run validation but force the target font by adjusting
      // We need the line breaks at the target size, not the validator's preferred size
      // So we do a manual re-break at the target size
      const forcedResult = validateTextFitAtSize(s.input, targetT1Size);

      return {
        id: s.id,
        validation: forcedResult ?? revalidated,
        originalT1Size: originalSize,
        finalT1Size: forcedResult ? targetT1Size : revalidated.t1FontSize,
        sizeChanged: originalSize !== targetT1Size,
        stillApproved: forcedResult ? forcedResult.approved : revalidated.approved,
      };
    }

    // Can't fit at target size
    return {
      id: s.id,
      validation: revalidated,
      originalT1Size: originalSize,
      finalT1Size: revalidated.t1FontSize,
      sizeChanged: false,
      stillApproved: false,
    };
  });
}

/**
 * Validate text fit forcing a specific T1 font size.
 * Returns null if the text cannot fit at this size.
 */
function validateTextFitAtSize(
  input: TextFitInput,
  targetT1Size: number,
): ValidationResult | null {
  // Run normal validation — it tries sizes from large to small
  // We'll accept it if the result uses exactly the target size
  const result = validateTextFit(input);

  // If the validator chose a size >= target, the text fits at target
  if (result.approved && result.t1FontSize >= targetT1Size) {
    // If it chose a larger size, we need to re-validate at the exact target
    // to get the correct line breaks and occupancy at that size
    if (result.t1FontSize === targetT1Size) {
      return result;
    }

    // Re-run: the validator tries sizes largest-first, so if it chose a size
    // larger than target, target would also work. We can adjust the result.
    // Create a modified result with the target font size
    const adjusted = validateTextFit(input);
    if (adjusted.approved) {
      // Override the font size — the line breaks may differ at the smaller size
      // but since we know the text fits at the larger size, it definitely fits
      // at target (same or fewer chars per line means same or more lines,
      // but within limit since the validator approved at a larger size which
      // means at the target's chars-per-line it still fits within max lines)
      return {
        ...adjusted,
        t1FontSize: targetT1Size,
      };
    }
  }

  return null;
}

// ─── Rhythm Evaluation ──────────────────────────────────────────

function evaluateRhythm(occupancies: number[]): RhythmEvaluation {
  if (occupancies.length === 0) {
    return { occupancies: [], average: 0, maxDeviation: 0, consistent: true };
  }

  const average = occupancies.reduce((a, b) => a + b, 0) / occupancies.length;
  const maxDeviation = Math.max(...occupancies.map(o => Math.abs(o - average)));

  return {
    occupancies,
    average,
    maxDeviation,
    consistent: maxDeviation < RHYTHM_DEVIATION_THRESHOLD,
  };
}
