/**
 * Content-Aware Zone Analyzer — Strict Readability Gate
 *
 * Analyzes a base image to find text placement zones that are
 * genuinely clean — no subject overlap, no texture, no color conflict.
 *
 * Scoring dimensions:
 *   - Uniformity: low brightness variance = clean background
 *   - Simplicity: low channel variance = less color noise
 *   - Contrast: sufficient distance between zone brightness and text color
 *   - Emptiness: bonus for very low overall activity (true negative space)
 *
 * Hard rejection rules (any ONE triggers rejection):
 *   1. Subject overlap: variance OR channelVariance above threshold
 *   2. High edge density: entropy above threshold (ripples, textures, patterns)
 *   3. Color conflict: high color saturation behind text area
 *   4. Poor contrast: brightness too close to text color
 *   5. Borderline zone: score < 40 (no borderline approvals)
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp');

// ─── Types ──────────────────────────────────────────────────────

export type ZoneId =
  | 'right'
  | 'left'
  | 'top_right'
  | 'bottom_right'
  | 'center_right';

export interface ZoneRegion {
  /** Fraction of canvas width for X start */
  x: number;
  /** Fraction of canvas height for Y start */
  y: number;
  /** Fraction of canvas width */
  width: number;
  /** Fraction of canvas height */
  height: number;
}

export interface ZoneAnalysis {
  zone: ZoneId;
  region: ZoneRegion;
  /** Average brightness (0–255) across the zone */
  brightness: number;
  /** Brightness standard deviation — low = uniform, high = busy */
  variance: number;
  /** Per-channel standard deviations averaged */
  channelVariance: number;
  /** Shannon entropy — higher = more visual information/detail */
  entropy: number;
  /** Color saturation — higher = stronger colors that conflict with text */
  saturation: number;
  /** Min-max range across channels — high = subject boundaries present */
  dynamicRange: number;
  /** Composite score (higher = better for text placement) */
  score: number;
  /** Whether this zone was hard-rejected */
  rejected: boolean;
  /** Rejection reason if rejected */
  rejectionReason?: string;
  /** Score breakdown */
  breakdown: ZoneScoreBreakdown;
}

export interface ZoneScoreBreakdown {
  /** 0–30: low variance = more uniform = better */
  uniformity: number;
  /** 0–25: low channel variance = less color noise */
  simplicity: number;
  /** 0–25: good contrast between background and text color */
  contrast: number;
  /** 0–20: bonus for zones with very low overall activity */
  emptiness: number;
}

export interface ZoneAnalysisResult {
  /** All analyzed zones, sorted by score (best first) */
  zones: ZoneAnalysis[];
  /** The best zone for text placement */
  bestZone: ZoneAnalysis;
  /** Analysis metadata */
  imageStats: {
    avgBrightness: number;
    overallVariance: number;
  };
}

// ─── Candidate Zones ────────────────────────────────────────────

const CANVAS = { width: 1080, height: 1350 };

/**
 * All candidate text zones.
 * Each zone is a rectangle defined as fractions of canvas dimensions.
 * Zones are positioned to avoid the center-left area where subjects typically sit.
 */
/**
 * All candidate text zones — aligned to stacked layout.
 * Text bar: y = 1030/1350 ≈ 0.763 to y = 1.0, full width.
 * All usable zones are inside the bar. Image-area zones will be rejected.
 */
export const CANDIDATE_ZONES: Record<ZoneId, ZoneRegion> = {
  // Full-width bar zone (primary)
  bottom_right: {
    x: 0.06,
    y: 0.77,
    width: 0.88,
    height: 0.21,
  },
  // Left half of bar
  left: {
    x: 0.06,
    y: 0.77,
    width: 0.44,
    height: 0.21,
  },
  // Right half of bar
  right: {
    x: 0.50,
    y: 0.77,
    width: 0.44,
    height: 0.21,
  },
  // Compact bar zone (tighter vertical)
  center_right: {
    x: 0.06,
    y: 0.78,
    width: 0.88,
    height: 0.18,
  },
  // Image area zone (will be rejected by gate — kept for analysis)
  top_right: {
    x: 0.50,
    y: 0.06,
    width: 0.42,
    height: 0.35,
  },
};

// ─── Strict Thresholds ──────────────────────────────────────────

/**
 * SUBJECT OVERLAP — reject if EITHER variance OR channelVariance is too high.
 * Changed from AND to OR logic. Lowered from 55/60 to 35/40.
 *
 * Previous: variance > 55 AND channelVariance > 60 (too permissive)
 * Now: variance > 35 OR channelVariance > 40 (strict)
 *
 * Calibration from last run:
 *   Bananas right zone: variance 58.3 → REJECTED (was 30, passed before)
 *   Flamingos bottom_right: variance 37.5 → REJECTED (was 31, passed before)
 *   Octopus right zone: variance 29.0 → PASSED (clean water)
 */
const SUBJECT_VARIANCE_THRESHOLD = 35;
const SUBJECT_CHANNEL_VARIANCE_THRESHOLD = 40;

/**
 * EDGE DENSITY — reject zones with high entropy (ripples, textures, patterns).
 * Entropy measures information density — high = busy, low = calm.
 * Clean backgrounds typically have entropy < 5.5.
 * Textured water, fabric, foliage: 6.0+
 */
const HIGH_ENTROPY_THRESHOLD = 6.0;

/**
 * COLOR CONFLICT — reject zones with high color saturation.
 * Saturated colors (reds, blues, greens) behind dark text = unreadable.
 * Saturation = max(R,G,B) - min(R,G,B) of channel means.
 * Clean backgrounds: saturation < 40.
 * Strawberry/flamingo: saturation 80+.
 */
const HIGH_SATURATION_THRESHOLD = 50;

/**
 * DYNAMIC RANGE — reject zones with large min-max spread.
 * High dynamic range = subject boundaries, strong edges, mixed content.
 * Clean background: range < 120.
 * Subject with background: range 180+.
 */
const HIGH_DYNAMIC_RANGE_THRESHOLD = 150;

/**
 * Minimum contrast distance from text color.
 * A zone must be far from mid-gray to be readable:
 *   - Very dark (< 50) → readable with white text
 *   - Very light (> 140) → readable with dark text
 *   - Mid-range (50–140) → poor contrast with either
 */
const MIN_CONTRAST = 90;

/** Dark text brightness (#1A1A1A ≈ 26) */
const DARK_TEXT_BRIGHTNESS = 26;
/** White text brightness (#FFFFFF ≈ 255) */
const WHITE_TEXT_BRIGHTNESS = 255;

/**
 * BORDERLINE SCORE REJECTION — zones scoring below this are rejected
 * even if no individual hard rejection triggered.
 * Raised from 20 to 40. No borderline approvals.
 */
const MIN_ACCEPTABLE_SCORE = 40;

// ─── Analysis ───────────────────────────────────────────────────

interface SharpChannelStats {
  min: number;
  max: number;
  sum: number;
  squaresSum: number;
  mean: number;
  stdev: number;
}

interface SharpStats {
  channels: SharpChannelStats[];
  isOpaque: boolean;
  entropy: number;
  sharpness: number;
  dominant: { r: number; g: number; b: number };
}

/**
 * Analyze a single zone of an image for text placement suitability.
 *
 * Strict rejection rules (any ONE rejects):
 *   1. Subject overlap: variance > 35 OR channelVariance > 40
 *   2. High edge density: entropy > 6.0
 *   3. Color conflict: saturation > 50
 *   4. High dynamic range: > 150
 *   5. Poor contrast: < 90
 *   6. Borderline score: < 40
 */
async function analyzeZone(
  imageBuffer: Buffer,
  zoneId: ZoneId,
  region: ZoneRegion,
): Promise<ZoneAnalysis> {
  // Convert fractional coordinates to pixels
  const extractRegion = {
    left: Math.round(region.x * CANVAS.width),
    top: Math.round(region.y * CANVAS.height),
    width: Math.round(region.width * CANVAS.width),
    height: Math.round(region.height * CANVAS.height),
  };

  // Clamp to canvas bounds
  extractRegion.width = Math.min(extractRegion.width, CANVAS.width - extractRegion.left);
  extractRegion.height = Math.min(extractRegion.height, CANVAS.height - extractRegion.top);

  // Extract the zone to a separate buffer first, then compute stats.
  // This avoids a sharp pipeline issue where .extract().stats() can
  // return full-image stats instead of zone-only stats.
  const zonePng: Buffer = await sharp(imageBuffer)
    .extract(extractRegion)
    .png()
    .toBuffer();
  const stats: SharpStats = await sharp(zonePng).stats();

  // Calculate metrics
  const channels = stats.channels;
  const rMean = channels[0]?.mean ?? 128;
  const gMean = channels[1]?.mean ?? 128;
  const bMean = channels[2]?.mean ?? 128;

  // Perceived brightness (ITU-R BT.601)
  const brightness = 0.299 * rMean + 0.587 * gMean + 0.114 * bMean;

  // Brightness variance — average stdev across channels
  const rStdev = channels[0]?.stdev ?? 0;
  const gStdev = channels[1]?.stdev ?? 0;
  const bStdev = channels[2]?.stdev ?? 0;
  const variance = (rStdev + gStdev + bStdev) / 3;

  // Channel variance — average stdev, weighted toward luminance
  const channelVariance = 0.299 * rStdev + 0.587 * gStdev + 0.114 * bStdev;

  // Entropy — information density (higher = more visual detail)
  const entropy = stats.entropy ?? 0;

  // Color saturation — max(R,G,B) - min(R,G,B) of channel means
  const saturation = Math.max(rMean, gMean, bMean) - Math.min(rMean, gMean, bMean);

  // Dynamic range — average of per-channel (max - min)
  const dynamicRange = channels.reduce((sum, ch) => sum + (ch.max - ch.min), 0) / channels.length;

  // ── Score ──────────────────────────────────────────────────────

  // Uniformity: low variance = clean background (max 30 points)
  // variance 0 = 30 pts, variance 30+ = 0 pts (tightened from 40)
  const uniformity = Math.max(0, Math.round(30 * (1 - Math.min(variance / 30, 1))));

  // Simplicity: low channel variance = less color noise (max 25 points)
  // channelVariance 0 = 25 pts, 35+ = 0 pts (tightened from 45)
  const simplicity = Math.max(0, Math.round(25 * (1 - Math.min(channelVariance / 35, 1))));

  // Contrast: supports both dark-on-light and light-on-dark text (max 25 points)
  // Either extreme (very dark or very light) scores well.
  const contrastFromDarkText = Math.abs(brightness - DARK_TEXT_BRIGHTNESS);
  const contrastFromWhiteText = Math.abs(brightness - WHITE_TEXT_BRIGHTNESS);
  const contrastDistance = Math.max(contrastFromDarkText, contrastFromWhiteText);
  const contrast = Math.max(0, Math.round(25 * Math.min(contrastDistance / 150, 1)));

  // Emptiness: bonus for very low overall activity (max 20 points)
  // Works for both light and dark backgrounds — peak at extremes (20 or 230)
  const brightnessExtremity = Math.max(
    1 - Math.abs(brightness - 20) / 100,   // dark background peak
    1 - Math.abs(brightness - 230) / 100,   // light background peak
  );
  const emptiness = (variance < 20 && entropy < 5.5 && saturation < 30)
    ? Math.round(20 * Math.max(0, brightnessExtremity))
    : 0;

  const breakdown: ZoneScoreBreakdown = { uniformity, simplicity, contrast, emptiness };
  let score = uniformity + simplicity + contrast + emptiness;

  // ── Hard rejections (any ONE triggers rejection) ─────────────

  let rejected = false;
  let rejectionReason: string | undefined;

  // 1. SUBJECT OVERLAP — variance OR channelVariance above threshold
  if (variance > SUBJECT_VARIANCE_THRESHOLD || channelVariance > SUBJECT_CHANNEL_VARIANCE_THRESHOLD) {
    rejected = true;
    rejectionReason = `Subject overlap — variance ${variance.toFixed(1)} (th: ${SUBJECT_VARIANCE_THRESHOLD}), channelVar ${channelVariance.toFixed(1)} (th: ${SUBJECT_CHANNEL_VARIANCE_THRESHOLD})`;
    score = -100;
  }

  // 2. HIGH EDGE DENSITY — entropy above threshold (ripples, textures, patterns)
  if (!rejected && entropy > HIGH_ENTROPY_THRESHOLD) {
    rejected = true;
    rejectionReason = `High edge density — entropy ${entropy.toFixed(2)} > ${HIGH_ENTROPY_THRESHOLD} (ripples/texture/patterns)`;
    score = -80;
  }

  // 3. COLOR CONFLICT — high saturation behind text area
  if (!rejected && saturation > HIGH_SATURATION_THRESHOLD) {
    rejected = true;
    rejectionReason = `Color conflict — saturation ${saturation.toFixed(0)} > ${HIGH_SATURATION_THRESHOLD} (strong colors behind text)`;
    score = -70;
  }

  // 4. HIGH DYNAMIC RANGE — subject boundaries present
  if (!rejected && dynamicRange > HIGH_DYNAMIC_RANGE_THRESHOLD) {
    rejected = true;
    rejectionReason = `High dynamic range — ${dynamicRange.toFixed(0)} > ${HIGH_DYNAMIC_RANGE_THRESHOLD} (subject edges in zone)`;
    score = -60;
  }

  // 5. POOR CONTRAST — brightness too close to text color
  if (!rejected && contrastDistance < MIN_CONTRAST) {
    rejected = true;
    rejectionReason = `Poor readability — brightness ${brightness.toFixed(0)}, contrast ${contrastDistance.toFixed(0)} < ${MIN_CONTRAST}`;
    score = -50;
  }

  // 6. BORDERLINE SCORE REJECTION — no borderline approvals
  if (!rejected && score < MIN_ACCEPTABLE_SCORE) {
    rejected = true;
    rejectionReason = `Borderline zone — score ${score} < ${MIN_ACCEPTABLE_SCORE} (not clean enough for text)`;
    score = -10;
  }

  return {
    zone: zoneId,
    region,
    brightness,
    variance,
    channelVariance,
    entropy,
    saturation,
    dynamicRange,
    score,
    rejected,
    rejectionReason,
    breakdown,
  };
}

// ─── Main API ───────────────────────────────────────────────────

/**
 * Analyze all candidate zones in an image and return the best placement.
 *
 * @param imageBuffer  The base image (before text overlay), 1080x1350 PNG
 * @param preferredZone  Optional: the zone declared in the slide definition.
 *                       Gets a small bonus (+5) if it scores well.
 * @returns ZoneAnalysisResult with all zones scored and best zone selected
 */
export async function analyzeImageZones(
  imageBuffer: Buffer,
  preferredZone?: ZoneId,
): Promise<ZoneAnalysisResult> {
  // Get overall image stats for context
  const overallStats: SharpStats = await sharp(imageBuffer).stats();
  const overallChannels = overallStats.channels;
  const avgBrightness = 0.299 * (overallChannels[0]?.mean ?? 128) +
    0.587 * (overallChannels[1]?.mean ?? 128) +
    0.114 * (overallChannels[2]?.mean ?? 128);
  const overallVariance = (
    (overallChannels[0]?.stdev ?? 0) +
    (overallChannels[1]?.stdev ?? 0) +
    (overallChannels[2]?.stdev ?? 0)
  ) / 3;

  // Analyze all zones in parallel
  const zoneEntries = Object.entries(CANDIDATE_ZONES) as [ZoneId, ZoneRegion][];
  const analyses = await Promise.all(
    zoneEntries.map(([id, region]) => analyzeZone(imageBuffer, id, region))
  );

  // Apply preferred zone bonus (only if it passed all hard rejections)
  if (preferredZone) {
    const preferred = analyses.find(a => a.zone === preferredZone);
    if (preferred && !preferred.rejected) {
      preferred.score += 5;
    }
  }

  // Sort by score descending
  analyses.sort((a, b) => b.score - a.score);

  // Best zone is the highest-scoring non-rejected zone
  const bestZone = analyses.find(a => !a.rejected) ?? analyses[0];

  return {
    zones: analyses,
    bestZone,
    imageStats: {
      avgBrightness,
      overallVariance,
    },
  };
}

/**
 * Select the best zone from an analysis result, with optional carousel consistency.
 * If a target zone is specified (from carousel normalization), check if it's acceptable.
 * If acceptable, use it. If not, fall back to the image-optimal zone.
 */
export function selectZoneWithConsistency(
  analysis: ZoneAnalysisResult,
  targetZone?: ZoneId,
): { zone: ZoneId; reason: string; forced: boolean } {
  if (!targetZone) {
    return {
      zone: analysis.bestZone.zone,
      reason: `Best scoring zone (score: ${analysis.bestZone.score})`,
      forced: false,
    };
  }

  // Check if the target zone is acceptable (not rejected, score >= MIN_ACCEPTABLE_SCORE)
  const target = analysis.zones.find(z => z.zone === targetZone);
  if (target && !target.rejected && target.score >= MIN_ACCEPTABLE_SCORE) {
    return {
      zone: targetZone,
      reason: `Carousel-consistent zone (score: ${target.score}, best was ${analysis.bestZone.score})`,
      forced: target.zone !== analysis.bestZone.zone,
    };
  }

  // Target zone is not acceptable — fall back to best
  return {
    zone: analysis.bestZone.zone,
    reason: `Carousel target "${targetZone}" rejected (${target?.rejectionReason ?? `score ${target?.score ?? 0} too low`}), using best zone`,
    forced: false,
  };
}

// ─── Carousel Zone Consistency ──────────────────────────────────

export interface CarouselZoneResult {
  /** The unified zone chosen for the carousel (if possible) */
  unifiedZone?: ZoneId;
  /** Whether all slides could use the same zone */
  consistent: boolean;
  /** Per-slide zone selections */
  perSlide: Array<{
    id: string;
    selectedZone: ZoneId;
    bestZone: ZoneId;
    forced: boolean;
    score: number;
    bestScore: number;
  }>;
}

/**
 * Determine a consistent zone across multiple slides.
 *
 * Strategy:
 * 1. Find which zones are acceptable (not rejected, score >= 40) for ALL slides
 * 2. Among those, pick the one with the highest total score across all slides
 * 3. If no zone works for all slides, fall back to per-slide best
 */
export function resolveCarouselZones(
  analyses: Array<{ id: string; analysis: ZoneAnalysisResult }>,
): CarouselZoneResult {
  if (analyses.length === 0) {
    return { consistent: true, perSlide: [] };
  }

  const allZoneIds: ZoneId[] = Object.keys(CANDIDATE_ZONES) as ZoneId[];

  // Find zones that are acceptable for ALL slides
  const universalZones: Array<{ zone: ZoneId; totalScore: number }> = [];

  for (const zoneId of allZoneIds) {
    let totalScore = 0;
    let allAcceptable = true;

    for (const { analysis } of analyses) {
      const zoneResult = analysis.zones.find(z => z.zone === zoneId);
      if (!zoneResult || zoneResult.rejected || zoneResult.score < MIN_ACCEPTABLE_SCORE) {
        allAcceptable = false;
        break;
      }
      totalScore += zoneResult.score;
    }

    if (allAcceptable) {
      universalZones.push({ zone: zoneId, totalScore });
    }
  }

  // Sort universal zones by total score
  universalZones.sort((a, b) => b.totalScore - a.totalScore);

  if (universalZones.length > 0) {
    // Use the best universal zone
    const unifiedZone = universalZones[0].zone;

    const perSlide = analyses.map(({ id, analysis }) => {
      const selected = analysis.zones.find(z => z.zone === unifiedZone)!;
      return {
        id,
        selectedZone: unifiedZone,
        bestZone: analysis.bestZone.zone,
        forced: analysis.bestZone.zone !== unifiedZone,
        score: selected.score,
        bestScore: analysis.bestZone.score,
      };
    });

    return {
      unifiedZone,
      consistent: true,
      perSlide,
    };
  }

  // No universal zone — fall back to per-slide best
  const perSlide = analyses.map(({ id, analysis }) => ({
    id,
    selectedZone: analysis.bestZone.zone,
    bestZone: analysis.bestZone.zone,
    forced: false,
    score: analysis.bestZone.score,
    bestScore: analysis.bestZone.score,
  }));

  return {
    consistent: false,
    perSlide,
  };
}
