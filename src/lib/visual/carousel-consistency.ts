/**
 * Perceptual Carousel Consistency Evaluator
 *
 * Evaluates visual consistency across carousel slides using
 * FINAL RENDERED layout data — not intended zones or pre-validation.
 *
 * Replaces the crude zone-occupancy-only rhythm metric with
 * a multi-dimensional perceptual consistency score.
 *
 * Dimensions:
 *   1. Vertical alignment consistency  — text blocks at similar vertical positions
 *   2. Text block weight consistency   — similar text block sizes
 *   3. Horizontal alignment consistency — text anchored at similar X positions
 *   4. Final rendered zone consistency — all slides use the same actual zone
 */

import type { RenderedLayout } from './fact-slide-renderer';

// ─── Types ──────────────────────────────────────────────────────

export interface PerceptualConsistencyResult {
  /** Overall consistency verdict */
  consistent: boolean;
  /** Overall score (0–100) */
  score: number;
  /** Individual dimension scores */
  dimensions: {
    verticalAlignment: DimensionScore;
    textBlockWeight: DimensionScore;
    horizontalAlignment: DimensionScore;
    zoneConsistency: DimensionScore;
  };
  /** Slides flagged as out-of-family */
  outOfFamily: string[];
  /** Per-slide layout summary */
  perSlide: Array<{
    id: string;
    finalZone: string;
    verticalCenter: number;
    horizontalCenter: number;
    textBlockHeight: number;
  }>;
}

interface DimensionScore {
  /** Score for this dimension (0–25) */
  score: number;
  /** Whether this dimension passes */
  pass: boolean;
  /** Human-readable detail */
  detail: string;
}

// ─── Constants ──────────────────────────────────────────────────

const CANVAS_HEIGHT = 1350;
const CANVAS_WIDTH = 1080;

/**
 * Maximum acceptable deviation in vertical center (as fraction of canvas height).
 * 0.15 = 15% of canvas height ≈ 200px — generous to accommodate different text lengths.
 */
const VERTICAL_ALIGNMENT_THRESHOLD = 0.15;

/**
 * Maximum acceptable ratio between tallest and shortest text blocks.
 * 2.5 means the tallest block can be at most 2.5x the shortest.
 */
const TEXT_WEIGHT_RATIO_THRESHOLD = 2.5;

/**
 * Maximum acceptable deviation in horizontal position (as fraction of canvas width).
 * 0.10 = 10% of canvas width ≈ 108px.
 */
const HORIZONTAL_ALIGNMENT_THRESHOLD = 0.10;

// ─── Scoring ────────────────────────────────────────────────────

/**
 * Score vertical alignment — are text blocks at similar vertical positions?
 *
 * Measures the spread of vertical center positions across slides.
 * Low spread = consistent visual rhythm when swiping.
 */
function scoreVerticalAlignment(
  layouts: Array<{ id: string; layout: RenderedLayout }>,
): DimensionScore {
  if (layouts.length <= 1) {
    return { score: 25, pass: true, detail: 'Single slide — trivially consistent' };
  }

  const vCenters = layouts.map(l => l.layout.verticalCenterNorm);
  const avg = vCenters.reduce((a, b) => a + b, 0) / vCenters.length;
  const maxDev = Math.max(...vCenters.map(v => Math.abs(v - avg)));

  const pass = maxDev <= VERTICAL_ALIGNMENT_THRESHOLD;
  const score = pass
    ? Math.round(25 * (1 - maxDev / VERTICAL_ALIGNMENT_THRESHOLD))
    : Math.round(25 * Math.max(0, 1 - maxDev / 0.3));

  const positions = layouts.map(l =>
    `${l.id}: ${Math.round(l.layout.verticalCenterNorm * 100)}%`
  ).join(', ');

  return {
    score,
    pass,
    detail: `Vertical centers: ${positions} (max deviation: ${(maxDev * 100).toFixed(0)}%, threshold: ${VERTICAL_ALIGNMENT_THRESHOLD * 100}%)`,
  };
}

/**
 * Score text block weight — are text blocks similarly sized?
 *
 * Measures the ratio of the tallest to shortest text block.
 * Similar sizes = consistent visual weight across slides.
 */
function scoreTextBlockWeight(
  layouts: Array<{ id: string; layout: RenderedLayout }>,
): DimensionScore {
  if (layouts.length <= 1) {
    return { score: 25, pass: true, detail: 'Single slide — trivially consistent' };
  }

  const heights = layouts.map(l => l.layout.textBlockHeight);
  const maxH = Math.max(...heights);
  const minH = Math.min(...heights);
  const ratio = minH > 0 ? maxH / minH : Infinity;

  const pass = ratio <= TEXT_WEIGHT_RATIO_THRESHOLD;
  const score = pass
    ? Math.round(25 * (1 - (ratio - 1) / (TEXT_WEIGHT_RATIO_THRESHOLD - 1)))
    : Math.round(25 * Math.max(0, 1 - (ratio - 1) / 4));

  const weights = layouts.map(l =>
    `${l.id}: ${l.layout.textBlockHeight}px`
  ).join(', ');

  return {
    score,
    pass,
    detail: `Block heights: ${weights} (ratio: ${ratio.toFixed(1)}x, threshold: ${TEXT_WEIGHT_RATIO_THRESHOLD}x)`,
  };
}

/**
 * Score horizontal alignment — are text blocks anchored at similar X positions?
 *
 * Measures the spread of horizontal center positions.
 * Consistent anchor = professional editorial feel when swiping.
 */
function scoreHorizontalAlignment(
  layouts: Array<{ id: string; layout: RenderedLayout }>,
): DimensionScore {
  if (layouts.length <= 1) {
    return { score: 25, pass: true, detail: 'Single slide — trivially consistent' };
  }

  const hCenters = layouts.map(l => l.layout.horizontalCenterNorm);
  const avg = hCenters.reduce((a, b) => a + b, 0) / hCenters.length;
  const maxDev = Math.max(...hCenters.map(h => Math.abs(h - avg)));

  const pass = maxDev <= HORIZONTAL_ALIGNMENT_THRESHOLD;
  const score = pass
    ? Math.round(25 * (1 - maxDev / HORIZONTAL_ALIGNMENT_THRESHOLD))
    : Math.round(25 * Math.max(0, 1 - maxDev / 0.2));

  const positions = layouts.map(l =>
    `${l.id}: ${Math.round(l.layout.horizontalCenterNorm * 100)}%`
  ).join(', ');

  return {
    score,
    pass,
    detail: `Horizontal centers: ${positions} (max deviation: ${(maxDev * 100).toFixed(0)}%, threshold: ${HORIZONTAL_ALIGNMENT_THRESHOLD * 100}%)`,
  };
}

/**
 * Score zone consistency — do all slides use the same final rendered zone?
 *
 * Uses the FINAL zone (after all fallbacks), not the intended zone.
 */
function scoreZoneConsistency(
  layouts: Array<{ id: string; layout: RenderedLayout }>,
): DimensionScore {
  if (layouts.length <= 1) {
    return { score: 25, pass: true, detail: 'Single slide — trivially consistent' };
  }

  const zones = new Set(layouts.map(l => l.layout.finalZone));
  const pass = zones.size <= 1;
  const score = pass ? 25 : 0;

  const zoneList = layouts.map(l => `${l.id}: ${l.layout.finalZone}`).join(', ');
  const detail = pass
    ? `All slides rendered in zone "${[...zones][0]}" — ${zoneList}`
    : `Mixed final zones: ${zoneList}`;

  return { score, pass, detail };
}

// ─── Main API ───────────────────────────────────────────────────

/**
 * Evaluate perceptual consistency across a carousel's rendered slides.
 *
 * @param slides Array of { id, layout } from the final rendered results
 * @returns PerceptualConsistencyResult
 */
export function evaluatePerceptualConsistency(
  slides: Array<{ id: string; layout: RenderedLayout }>,
): PerceptualConsistencyResult {
  if (slides.length === 0) {
    return {
      consistent: true,
      score: 100,
      dimensions: {
        verticalAlignment: { score: 25, pass: true, detail: 'No slides' },
        textBlockWeight: { score: 25, pass: true, detail: 'No slides' },
        horizontalAlignment: { score: 25, pass: true, detail: 'No slides' },
        zoneConsistency: { score: 25, pass: true, detail: 'No slides' },
      },
      outOfFamily: [],
      perSlide: [],
    };
  }

  const verticalAlignment = scoreVerticalAlignment(slides);
  const textBlockWeight = scoreTextBlockWeight(slides);
  const horizontalAlignment = scoreHorizontalAlignment(slides);
  const zoneConsistency = scoreZoneConsistency(slides);

  const totalScore = verticalAlignment.score + textBlockWeight.score +
    horizontalAlignment.score + zoneConsistency.score;

  // Consistent if all dimensions pass OR total score >= 70
  const allPass = verticalAlignment.pass && textBlockWeight.pass &&
    horizontalAlignment.pass && zoneConsistency.pass;
  const consistent = allPass || totalScore >= 70;

  // Out-of-family detection
  const outOfFamily: string[] = [];

  if (slides.length > 1) {
    // Check for vertical outliers
    const vCenters = slides.map(s => s.layout.verticalCenterNorm);
    const vAvg = vCenters.reduce((a, b) => a + b, 0) / vCenters.length;
    for (const s of slides) {
      if (Math.abs(s.layout.verticalCenterNorm - vAvg) > VERTICAL_ALIGNMENT_THRESHOLD * 1.5) {
        outOfFamily.push(`${s.id} (vertical position outlier)`);
      }
    }

    // Check for zone mismatch
    const majorityZone = [...new Set(slides.map(s => s.layout.finalZone))]
      .sort((a, b) =>
        slides.filter(s => s.layout.finalZone === b).length -
        slides.filter(s => s.layout.finalZone === a).length
      )[0];
    for (const s of slides) {
      if (s.layout.finalZone !== majorityZone) {
        outOfFamily.push(`${s.id} (zone "${s.layout.finalZone}" differs from majority "${majorityZone}")`);
      }
    }
  }

  const perSlide = slides.map(s => ({
    id: s.id,
    finalZone: s.layout.finalZone,
    verticalCenter: s.layout.verticalCenter,
    horizontalCenter: s.layout.horizontalCenter,
    textBlockHeight: s.layout.textBlockHeight,
  }));

  return {
    consistent,
    score: totalScore,
    dimensions: {
      verticalAlignment,
      textBlockWeight,
      horizontalAlignment,
      zoneConsistency,
    },
    outOfFamily,
    perSlide,
  };
}
