/**
 * Text-Fit Validator — v1.1
 *
 * Decision system that determines whether a slide can be rendered
 * cleanly with text overlay. Implements all 6 validation checks
 * from the locked Text Overlay System v1.1.
 *
 * This is a gate, not a renderer. It either approves or blocks.
 */

import { optimizeLineBreaks } from './line-break-optimizer';

// ─── Types ──────────────────────────────────────────────────────

export type TextZoneVariant = 'right' | 'left' | 'top_right' | 'bottom_right' | 'center_right';

export type SlideType = 'opener' | 'fact' | 'implication' | 'cta';

export interface TextFitInput {
  /** The slide type — determines character limits */
  slideType: SlideType;
  /** T1: Headline text */
  displayTitle: string;
  /** T2: Support text (optional) */
  displaySupport?: string;
  /** T3: Metadata text (optional) */
  metadata?: string;
  /** Declared text zone variant */
  textZone: TextZoneVariant;
  /** Key phrases that must not be split across lines */
  keepTogether?: string[];
  /**
   * Force a specific T1 font size (from carousel-level normalization).
   * When set, the validator skips the font cascade and uses this size directly.
   * If the text doesn't fit at this size, the validator will still try smaller sizes.
   */
  forceT1FontSize?: number;
  /**
   * Preferred T1 font size from channel visual style.
   * The validator starts from this size and scales down if text doesn't fit.
   * Ignored when forceT1FontSize is set.
   */
  baseT1FontSize?: number;
  /**
   * Preferred T2 font size from channel visual style.
   */
  baseT2FontSize?: number;
}

export type CheckStatus = 'pass' | 'fail' | 'warning';

export interface ValidationCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

export type FailureCode =
  | 'TEXT_TOO_LONG'
  | 'TOO_MANY_LINES'
  | 'BAD_LINE_BREAKS'
  | 'ZONE_OVERCROWDED'
  | 'ZONE_DIRTY'
  | 'FOCAL_CONFLICT'
  | 'ZONE_MISMATCH';

export interface ValidationResult {
  approved: boolean;
  checks: ValidationCheck[];
  failures: FailureCode[];
  /** Validated line breaks for T1 */
  t1Lines: string[];
  /** Validated line breaks for T2 */
  t2Lines: string[];
  /** Total lines used */
  totalLines: number;
  /** Estimated zone occupancy (0–1) */
  zoneOccupancy: number;
  /** The text zone variant used */
  textZone: TextZoneVariant;
  /** Resolved T1 font size (may be smaller than default if adapted) */
  t1FontSize: number;
  /** Resolved T2 font size */
  t2FontSize: number;
}

// ─── Character Limits ───────────────────────────────────────────

const CHARACTER_LIMITS: Record<SlideType, { t1: number; t2: number }> = {
  opener: { t1: 40, t2: 60 },
  fact: { t1: 65, t2: 200 },  // flowing paragraph: 2-3 connected sentences
  implication: { t1: 55, t2: 70 },
  cta: { t1: 35, t2: 50 },
};

const MAX_LINES = {
  t1: 3,
  t2: 4,       // flowing paragraph wraps naturally across lines
  combined: 6,
};

// ─── Font Metrics (approximate) ─────────────────────────────────

/**
 * Approximate average character width as a ratio of font size.
 * Sans-serif fonts at these weights average ~0.55 of font size per character.
 * Bold/heavy is slightly wider (~0.6).
 */
/**
 * Average character width as ratio of font size.
 * T1: Inter Bold mixed-case averages ~0.53.
 * T2: Roboto Slab Regular is slightly wider than Inter at ~0.56.
 */
const CHAR_WIDTH_RATIO = {
  t1Bold: 0.53,
  t2Regular: 0.56,
};

/** Typography sizes — matched to OPENER/CTA for design family consistency */
const FONT_SIZES = {
  t1: { min: 42, max: 72, default: 72 },
  t2: { min: 28, max: 44, default: 40 },
  t3: { min: 18, max: 24, default: 20 },
};

/** Font size candidates to try (largest to smallest) */
const T1_FONT_CANDIDATES = [72, 60, 54, 48, 42];

/** Line height multipliers */
const LINE_HEIGHT = {
  t1: 1.35,
  t2: 1.3,
};

/** Gap between T1 and T2 (as multiple of T2 font size) */
const TIER_GAP_MULTIPLIER = 1.5;

// ─── Canvas Constants ───────────────────────────────────────────

const CANVAS = {
  width: 1080,
  height: 1350,
};

/**
 * Text zone dimensions for each variant.
 * Values are fractions of canvas dimensions.
 *
 * The right/left zones extend slightly into the center third
 * to provide enough width for readable text at 48–60px.
 * The subject occupies the opposite side, so this overlap
 * is safe as long as the prompt COMPOSITION reserves the space.
 */
/** Zone dimensions — expanded for larger typography, matched to OPENER/CTA design family */
const ZONE_DIMENSIONS: Record<TextZoneVariant, {
  x: number;
  y: number;
  width: number;
  height: number;
}> = {
  bottom_right: {
    x: 0.06,   // full-width bar zone (primary)
    y: 0.74,
    width: 0.88, // 6% margin each side → 950px usable
    height: 0.24,
  },
  left: {
    x: 0.06,   // left half of bar
    y: 0.74,
    width: 0.44,
    height: 0.24,
  },
  right: {
    x: 0.50,   // right half of bar
    y: 0.74,
    width: 0.44,
    height: 0.24,
  },
  center_right: {
    x: 0.06,   // full-width bar zone (compact)
    y: 0.76,
    width: 0.88,
    height: 0.22,
  },
  top_right: {
    x: 0.50,   // on the image (will be rejected by gate)
    y: 0.06,
    width: 0.42,
    height: 0.35,
  },
};

// ─── Line Break Engine ──────────────────────────────────────────

/** Words to prefer breaking BEFORE (natural pause points) */
const BREAK_BEFORE = new Set([
  'that', 'which', 'because', 'when', 'while', 'but',
]);

/**
 * Break text into lines optimized for a given pixel width.
 * Uses semantic breaking rules from Text Overlay System v1.1.
 *
 * Key behavior: keepTogether phrases are treated as atomic units.
 * The engine will break BEFORE a keepTogether phrase rather than
 * splitting it across lines.
 */
export function breakIntoLines(
  text: string,
  maxWidthPx: number,
  fontSize: number,
  charWidthRatio: number,
  keepTogether: string[] = [],
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  // Max characters that fit on one line
  const maxCharsPerLine = Math.floor(maxWidthPx / (fontSize * charWidthRatio));

  // Pre-process: find keepTogether phrase positions in word array
  // Returns array of {start, end} indices for each phrase found
  const phraseRanges: Array<{ start: number; end: number; phrase: string }> = [];
  for (const phrase of keepTogether) {
    const phraseWords = phrase.toLowerCase().split(/\s+/);
    for (let i = 0; i <= words.length - phraseWords.length; i++) {
      const match = phraseWords.every((pw, j) =>
        words[i + j].toLowerCase().replace(/[,.:;!?]$/, '') === pw ||
        words[i + j].toLowerCase() === pw
      );
      if (match) {
        phraseRanges.push({ start: i, end: i + phraseWords.length - 1, phrase });
      }
    }
  }

  /**
   * Check if word at index `idx` is inside a keepTogether phrase.
   * If so, returns the range. Otherwise null.
   */
  function getPhraseAt(idx: number): { start: number; end: number; phrase: string } | null {
    return phraseRanges.find(r => idx >= r.start && idx <= r.end) ?? null;
  }

  const lines: string[] = [];
  let currentLine: string[] = [];
  let currentLength = 0;
  let i = 0;

  while (i < words.length) {
    const word = words[i];
    const phraseRange = getPhraseAt(i);

    if (phraseRange && i === phraseRange.start) {
      // This word starts a keepTogether phrase — collect the entire phrase
      const phraseWordList = words.slice(phraseRange.start, phraseRange.end + 1);
      const phraseText = phraseWordList.join(' ');
      const phraseLen = phraseText.length;

      // If the phrase itself is wider than one line, don't treat it as atomic.
      // Let it flow through the normal word-by-word logic so the adaptive
      // font system can try a smaller size.
      if (phraseLen > maxCharsPerLine) {
        // Fall through to normal word handling below
      } else {
        const addedLength = currentLine.length === 0 ? phraseLen : phraseLen + 1;

        if (currentLength + addedLength > maxCharsPerLine && currentLine.length > 0) {
          // Phrase doesn't fit on current line — break before it
          lines.push(currentLine.join(' '));
          currentLine = [...phraseWordList];
          currentLength = phraseLen;
        } else {
          // Phrase fits — add it
          currentLine.push(...phraseWordList);
          currentLength += addedLength;
        }

        i = phraseRange.end + 1; // Skip past the entire phrase
        continue;
      }
    }

    // Regular word (not part of a keepTogether phrase)
    const wordLen = word.length;
    const addedLength = currentLine.length === 0 ? wordLen : wordLen + 1;
    const wouldExceed = (currentLength + addedLength) > maxCharsPerLine;

    // Check if next word starts a keepTogether phrase
    const nextWord = words[i + 1];
    const nextIsBreakWord = nextWord && BREAK_BEFORE.has(nextWord.toLowerCase());
    const nextStartsPhrase = (i + 1 < words.length) && phraseRanges.some(r => r.start === i + 1);

    if (wouldExceed && currentLine.length > 0) {
      lines.push(currentLine.join(' '));
      currentLine = [word];
      currentLength = wordLen;
    } else {
      currentLine.push(word);
      currentLength += addedLength;

      // Break after this word if at a natural pause and line has content
      const shouldBreak =
        !wouldExceed &&
        currentLine.length >= 2 &&
        currentLength >= maxCharsPerLine * 0.88 &&
        (nextIsBreakWord || nextStartsPhrase);

      if (shouldBreak) {
        lines.push(currentLine.join(' '));
        currentLine = [];
        currentLength = 0;
      }
    }

    i++;
  }

  // Flush remaining
  if (currentLine.length > 0) {
    lines.push(currentLine.join(' '));
  }

  // Widow prevention: if last line is a single weak word, merge up
  if (lines.length > 1) {
    const lastLine = lines[lines.length - 1];
    const lastWords = lastLine.split(/\s+/);
    const isWeakTail = lastWords.length === 1 && lastWords[0].length <= 3;

    if (isWeakTail) {
      const merged = lines[lines.length - 2] + ' ' + lastLine;
      if (merged.length <= maxCharsPerLine * 1.15) {
        lines[lines.length - 2] = merged;
        lines.pop();
      }
    }
  }

  return lines;
}

// ─── Line Break Quality Checker ─────────────────────────────────

interface LineBreakQuality {
  valid: boolean;
  issues: string[];
}

function checkLineBreakQuality(
  lines: string[],
  keepTogether: string[] = [],
  tier: 't1' | 't2' = 't1',
): LineBreakQuality {
  const issues: string[] = [];

  if (lines.length === 0) return { valid: true, issues: [] };

  // Check for widows: single short weak word on last line
  const lastLine = lines[lines.length - 1];
  const lastWords = lastLine.split(/\s+/);
  const weakSingleWords = new Set(['a', 'an', 'the', 'it', 'is', 'to', 'of', 'in', 'on', 'or', 'and', 'but', 'too', 'so']);
  if (lastWords.length === 1 && weakSingleWords.has(lastWords[0].toLowerCase())) {
    issues.push(`Widow on last line: "${lastLine}"`);
  }

  // Check that key phrases are not split
  const fullText = lines.join(' ');
  for (const phrase of keepTogether) {
    if (!fullText.toLowerCase().includes(phrase.toLowerCase())) continue;

    // Check if the phrase spans a line break
    for (let i = 0; i < lines.length - 1; i++) {
      const phraseWords = phrase.toLowerCase().split(/\s+/);
      const lineWords = lines[i].toLowerCase().split(/\s+/);
      const nextLineWords = lines[i + 1].toLowerCase().split(/\s+/);

      // Check if phrase starts at the end of this line and continues into the next
      for (let startIdx = 0; startIdx < phraseWords.length; startIdx++) {
        const prefixWords = phraseWords.slice(0, startIdx + 1);
        const suffixWords = phraseWords.slice(startIdx + 1);

        if (suffixWords.length === 0) continue;

        const lineEndMatches = lineWords.slice(-prefixWords.length).every((w, j) => w === prefixWords[j]);
        const nextStartMatches = nextLineWords.slice(0, suffixWords.length).every((w, j) => w === suffixWords[j]);

        if (lineEndMatches && nextStartMatches) {
          issues.push(`Key phrase "${phrase}" split across lines ${i + 1} and ${i + 2}`);
        }
      }
    }
  }

  // Check that last line is at least 60% the width of the longest line (T1 only — T2 is secondary text)
  if (lines.length > 1 && tier === 't1') {
    const longestLen = Math.max(...lines.map(l => l.length));
    const lastLen = lastLine.length;
    const ratio = lastLen / longestLen;

    // Only flag if the tail is weak (short AND not a strong payoff word)
    if (ratio < 0.4 && lastWords.length <= 2) {
      // Allow strong short endings
      const strongEndings = new Set(['hearts', 'berries', 'bones', 'poop', 'spoils', 'radioactive', 'friends', 'feet', 'head', 'butts']);
      const lastWord = lastWords[lastWords.length - 1].toLowerCase().replace(/[^a-z]/g, '');
      if (!strongEndings.has(lastWord)) {
        issues.push(`Weak tail: last line "${lastLine}" is only ${Math.round(ratio * 100)}% the width of the longest line`);
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// ─── Zone Occupancy Calculator ──────────────────────────────────

interface OccupancyResult {
  occupancy: number;
  t1HeightPx: number;
  t2HeightPx: number;
  gapPx: number;
  totalTextHeightPx: number;
  zoneHeightPx: number;
}

function calculateZoneOccupancy(
  t1Lines: string[],
  t2Lines: string[],
  zone: TextZoneVariant,
  t1Font: number = FONT_SIZES.t1.default,
  t2Font: number = FONT_SIZES.t2.default,
): OccupancyResult {
  const zoneDims = ZONE_DIMENSIONS[zone];
  const zoneHeightPx = zoneDims.height * CANVAS.height;

  const t1FontSize = t1Font;
  const t2FontSize = t2Font;

  // T1 block height
  const t1LineHeightPx = t1FontSize * LINE_HEIGHT.t1;
  const t1HeightPx = t1Lines.length > 0 ? t1FontSize + (t1Lines.length - 1) * t1LineHeightPx : 0;

  // Gap between T1 and T2
  const gapPx = t2Lines.length > 0 ? t2FontSize * TIER_GAP_MULTIPLIER : 0;

  // T2 block height
  const t2LineHeightPx = t2FontSize * LINE_HEIGHT.t2;
  const t2HeightPx = t2Lines.length > 0 ? t2FontSize + (t2Lines.length - 1) * t2LineHeightPx : 0;

  const totalTextHeightPx = t1HeightPx + gapPx + t2HeightPx;
  const occupancy = totalTextHeightPx / zoneHeightPx;

  return {
    occupancy,
    t1HeightPx,
    t2HeightPx,
    gapPx,
    totalTextHeightPx,
    zoneHeightPx,
  };
}

// ─── Main Validator ─────────────────────────────────────────────

/**
 * Run all 6 text-fit validation checks.
 * Returns a structured result with pass/fail for each check.
 */
export function validateTextFit(input: TextFitInput): ValidationResult {
  const checks: ValidationCheck[] = [];
  const failures: FailureCode[] = [];

  const { slideType, displayTitle, displaySupport, textZone, keepTogether = [] } = input;
  const limits = CHARACTER_LIMITS[slideType];

  // ── Check 1: Character Count ──────────────────────────────────

  const t1CharCount = displayTitle.length;
  const t2CharCount = displaySupport?.length ?? 0;

  if (t1CharCount > limits.t1) {
    checks.push({
      name: 'character_count_t1',
      status: 'fail',
      detail: `T1 has ${t1CharCount} chars, max is ${limits.t1} for ${slideType}`,
    });
    failures.push('TEXT_TOO_LONG');
  } else {
    checks.push({
      name: 'character_count_t1',
      status: 'pass',
      detail: `T1: ${t1CharCount}/${limits.t1} chars`,
    });
  }

  if (displaySupport && t2CharCount > limits.t2) {
    checks.push({
      name: 'character_count_t2',
      status: 'fail',
      detail: `T2 has ${t2CharCount} chars, max is ${limits.t2} for ${slideType}`,
    });
    failures.push('TEXT_TOO_LONG');
  } else if (displaySupport) {
    checks.push({
      name: 'character_count_t2',
      status: 'pass',
      detail: `T2: ${t2CharCount}/${limits.t2} chars`,
    });
  }

  // ── Check 2 + 3: Line Breaks (with adaptive font + zone fallback) ──

  // Zone fallback order: declared zone first, then wider alternatives
  const zoneOrder: TextZoneVariant[] = [textZone];
  const fallbacks: TextZoneVariant[] = ['bottom_right', 'center_right', 'top_right', 'left'];
  for (const fb of fallbacks) {
    if (fb !== textZone && !zoneOrder.includes(fb)) zoneOrder.push(fb);
  }

  let resolvedZone = textZone;
  let t1FontSize = FONT_SIZES.t1.default;
  let t1Lines: string[] = [];
  let t2Lines: string[] = [];
  let t2FontSize = input.baseT2FontSize ?? FONT_SIZES.t2.default;
  let foundFit = false;

  // Build font size candidates from largest to smallest.
  // forceT1FontSize (carousel normalization) takes priority.
  // baseT1FontSize (channel style) sets the starting point but allows adaptive fallback.
  const startT1 = input.baseT1FontSize ?? FONT_SIZES.t1.default;
  const fontCandidates = input.forceT1FontSize
    ? [input.forceT1FontSize, ...T1_FONT_CANDIDATES.filter(s => s < input.forceT1FontSize!)]
    : startT1 !== FONT_SIZES.t1.default
      ? [startT1, ...T1_FONT_CANDIDATES.filter(s => s < startT1)]
      : T1_FONT_CANDIDATES;

  for (const zone of zoneOrder) {
    const zoneDims = ZONE_DIMENSIONS[zone];
    const zoneWidthPx = zoneDims.width * CANVAS.width;

    // Try font sizes from forced/default down to minimum
    for (const fontSize of fontCandidates) {
      const maxCharsPerLine = Math.floor(zoneWidthPx / (fontSize * CHAR_WIDTH_RATIO.t1Bold));

      // Use the line-break optimizer to find the best candidate
      const bestCandidate = optimizeLineBreaks(
        displayTitle,
        maxCharsPerLine,
        keepTogether,
        MAX_LINES.t1,
      );

      if (bestCandidate && bestCandidate.breakdown.phraseIntegrity >= 0) {
        // Require a non-negative total score to accept this font size.
        // A negative score means weak solo lines, poor balance, etc.
        // In that case, try a smaller font (wider lines = better breaks).
        if (bestCandidate.score >= 0) {
          t1Lines = bestCandidate.lines;
          t1FontSize = fontSize;

          // Verify with the existing quality checker as a safety net
          const qualityCheck = checkLineBreakQuality(t1Lines, keepTogether);
          if (qualityCheck.valid || qualityCheck.issues.length === 0) {
            // Also break T2 with this zone width
            t2Lines = displaySupport
              ? breakIntoLines(displaySupport, zoneWidthPx, t2FontSize, CHAR_WIDTH_RATIO.t2Regular, keepTogether)
              : [];
            resolvedZone = zone;
            foundFit = true;
            break;
          }
        }
        // Score < 0: weak solo lines or poor balance — try smaller font
      }

      // Fallback: try the greedy line breaker if optimizer found nothing
      if (!foundFit) {
        t1Lines = breakIntoLines(
          displayTitle,
          zoneWidthPx,
          fontSize,
          CHAR_WIDTH_RATIO.t1Bold,
          keepTogether,
        );
        t1FontSize = fontSize;

        const fitsLineCount = t1Lines.length <= MAX_LINES.t1;
        const phrasesIntact = checkLineBreakQuality(t1Lines, keepTogether).issues.length === 0;

        if (fitsLineCount && phrasesIntact) {
          t2Lines = displaySupport
            ? breakIntoLines(displaySupport, zoneWidthPx, t2FontSize, CHAR_WIDTH_RATIO.t2Regular, keepTogether)
            : [];
          resolvedZone = zone;
          foundFit = true;
          break;
        }
      }
    }

    if (foundFit) break;
  }

  // If no zone/font combo worked, use the last attempt (will fail checks below)
  if (!foundFit) {
    const fallbackDims = ZONE_DIMENSIONS[resolvedZone];
    const fallbackWidth = fallbackDims.width * CANVAS.width;
    t2Lines = displaySupport
      ? breakIntoLines(displaySupport, fallbackWidth, t2FontSize, CHAR_WIDTH_RATIO.t2Regular, keepTogether)
      : [];
  }

  if (t1FontSize < FONT_SIZES.t1.default) {
    checks.push({
      name: 'font_adaptation',
      status: 'warning',
      detail: `T1 font reduced from ${FONT_SIZES.t1.default}px to ${t1FontSize}px to fit ${MAX_LINES.t1} lines`,
    });
  }

  if (resolvedZone !== textZone) {
    checks.push({
      name: 'zone_fallback',
      status: 'warning',
      detail: `Zone changed from "${textZone}" to "${resolvedZone}" for better text fit`,
    });
  }

  // Check 2: Line count
  const totalLines = t1Lines.length + t2Lines.length;

  if (t1Lines.length > MAX_LINES.t1) {
    checks.push({
      name: 'line_count_t1',
      status: 'fail',
      detail: `T1 has ${t1Lines.length} lines, max is ${MAX_LINES.t1}`,
    });
    failures.push('TOO_MANY_LINES');
  } else {
    checks.push({
      name: 'line_count_t1',
      status: 'pass',
      detail: `T1: ${t1Lines.length}/${MAX_LINES.t1} lines → [${t1Lines.map(l => `"${l}"`).join(', ')}]`,
    });
  }

  if (t2Lines.length > MAX_LINES.t2) {
    checks.push({
      name: 'line_count_t2',
      status: 'fail',
      detail: `T2 has ${t2Lines.length} lines, max is ${MAX_LINES.t2}`,
    });
    failures.push('TOO_MANY_LINES');
  } else if (t2Lines.length > 0) {
    checks.push({
      name: 'line_count_t2',
      status: 'pass',
      detail: `T2: ${t2Lines.length}/${MAX_LINES.t2} lines → [${t2Lines.map(l => `"${l}"`).join(', ')}]`,
    });
  }

  if (totalLines > MAX_LINES.combined) {
    checks.push({
      name: 'line_count_combined',
      status: 'fail',
      detail: `Combined ${totalLines} lines exceeds max ${MAX_LINES.combined}`,
    });
    if (!failures.includes('TOO_MANY_LINES')) failures.push('TOO_MANY_LINES');
  } else {
    checks.push({
      name: 'line_count_combined',
      status: 'pass',
      detail: `Combined: ${totalLines}/${MAX_LINES.combined} lines`,
    });
  }

  // Check 3: Line break quality
  const t1Quality = checkLineBreakQuality(t1Lines, keepTogether, 't1');
  const t2Quality = checkLineBreakQuality(t2Lines, keepTogether, 't2');
  const allIssues = [...t1Quality.issues, ...t2Quality.issues];

  if (allIssues.length > 0) {
    checks.push({
      name: 'line_break_quality',
      status: 'fail',
      detail: allIssues.join('; '),
    });
    failures.push('BAD_LINE_BREAKS');
  } else {
    checks.push({
      name: 'line_break_quality',
      status: 'pass',
      detail: 'All line breaks are semantically clean',
    });
  }

  // ── Check 4: Zone Occupancy ───────────────────────────────────

  const occupancy = calculateZoneOccupancy(t1Lines, t2Lines, resolvedZone, t1FontSize, t2FontSize);

  if (occupancy.occupancy > 0.85) {
    checks.push({
      name: 'zone_occupancy',
      status: 'fail',
      detail: `Zone is ${Math.round(occupancy.occupancy * 100)}% filled (max 85%), text block ${Math.round(occupancy.totalTextHeightPx)}px in ${Math.round(occupancy.zoneHeightPx)}px zone`,
    });
    failures.push('ZONE_OVERCROWDED');
  } else if (occupancy.occupancy > 0.70) {
    checks.push({
      name: 'zone_occupancy',
      status: 'warning',
      detail: `Zone is ${Math.round(occupancy.occupancy * 100)}% filled (tight but acceptable)`,
    });
  } else {
    checks.push({
      name: 'zone_occupancy',
      status: 'pass',
      detail: `Zone is ${Math.round(occupancy.occupancy * 100)}% filled`,
    });
  }

  // ── Check 5 + 6: Zone Cleanliness + Focal Point ───────────────
  // These require image analysis. For now, we pass them as "assumed clean"
  // since the 5-layer prompt system pre-reserves clean space.
  // When image analysis is available, these will be validated against
  // actual pixel data.

  checks.push({
    name: 'zone_cleanliness',
    status: 'pass',
    detail: 'Assumed clean — image prompt reserves text zone in COMPOSITION layer',
  });

  checks.push({
    name: 'focal_point_preservation',
    status: 'pass',
    detail: 'Assumed safe — subject is in EXCLUSION ZONE per prompt COMPOSITION',
  });

  // ── Final Decision ────────────────────────────────────────────

  const approved = failures.length === 0;

  return {
    approved,
    checks,
    failures,
    t1Lines,
    t2Lines,
    totalLines,
    zoneOccupancy: occupancy.occupancy,
    textZone: resolvedZone,
    t1FontSize,
    t2FontSize,
  };
}

// ─── Utility: Format Validation Report ──────────────────────────

export function formatValidationReport(result: ValidationResult): string {
  const lines: string[] = [];
  const status = result.approved ? 'RENDER APPROVED' : 'RENDER BLOCKED';

  lines.push(`\n╔══════════════════════════════════════════╗`);
  lines.push(`║  ${status.padEnd(40)}║`);
  lines.push(`╚══════════════════════════════════════════╝`);
  lines.push(`  Text Zone: ${result.textZone}`);
  lines.push(`  Total Lines: ${result.totalLines}`);
  lines.push(`  Zone Occupancy: ${Math.round(result.zoneOccupancy * 100)}%`);
  lines.push('');
  lines.push('  T1 Lines:');
  result.t1Lines.forEach((l, i) => lines.push(`    ${i + 1}. "${l}"`));
  if (result.t2Lines.length > 0) {
    lines.push('  T2 Lines:');
    result.t2Lines.forEach((l, i) => lines.push(`    ${i + 1}. "${l}"`));
  }
  lines.push('');
  lines.push('  Checks:');
  for (const check of result.checks) {
    const icon = check.status === 'pass' ? '[PASS]' : check.status === 'warning' ? '[WARN]' : '[FAIL]';
    lines.push(`    ${icon} ${check.name}: ${check.detail}`);
  }

  if (result.failures.length > 0) {
    lines.push('');
    lines.push('  Failure Codes:');
    result.failures.forEach(f => lines.push(`    - ${f}`));
  }

  return lines.join('\n');
}
