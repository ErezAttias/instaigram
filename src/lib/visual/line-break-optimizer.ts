/**
 * Line Break Optimizer — v1.0
 *
 * Generates multiple line-break candidates for T1 headline text
 * and scores each one to select the best visual/semantic layout.
 *
 * Rejects:
 *   - "Octopuses / have / three hearts"  (weak solo middle line)
 *   - "A group of flamingos / is / called a flamboyance"  (weak solo middle line)
 *
 * Prefers:
 *   - "Octopuses have / three hearts"
 *   - "A group of flamingos / is called a flamboyance"
 */

// ─── Types ──────────────────────────────────────────────────────

export interface LineBreakCandidate {
  /** The lines produced by this break */
  lines: string[];
  /** Number of lines */
  lineCount: number;
  /** Composite score (higher = better) */
  score: number;
  /** Individual score components */
  breakdown: ScoreBreakdown;
}

interface ScoreBreakdown {
  /** -100 if a keepTogether phrase is split, 0 otherwise */
  phraseIntegrity: number;
  /** Penalty for weak solo lines ("is", "have", "a", etc.) — -40 per occurrence */
  weakSoloLine: number;
  /** 0 to +30 based on how balanced line lengths are */
  visualBalance: number;
  /** Bonus for breaking at natural grammatical pauses */
  grammaticalBreak: number;
  /** Slight preference for fewer lines (fewer = higher) */
  lineCountPreference: number;
}

// ─── Constants ──────────────────────────────────────────────────

/** Words that should NEVER appear alone on a line */
const WEAK_SOLO_WORDS = new Set([
  'a', 'an', 'the', 'it', 'is', 'are', 'was', 'were',
  'to', 'of', 'in', 'on', 'at', 'by', 'or', 'and', 'but',
  'so', 'as', 'if', 'no', 'not', 'for', 'has', 'had', 'have',
  'do', 'did', 'can', 'may', 'be', 'we', 'us', 'he', 'she',
]);

/** Words that mark good grammatical break points (break BEFORE these) */
const GRAMMATICAL_BREAK_WORDS = new Set([
  'that', 'which', 'because', 'when', 'while', 'but', 'and', 'or',
  'not', 'never', 'always', 'only', 'still', 'yet', 'through',
  'is', 'are', 'was', 'were', 'has', 'have', 'had',
]);

// ─── Candidate Generation ───────────────────────────────────────

/**
 * Generate all valid line-break candidates for 1, 2, and 3-line layouts.
 *
 * For N words, there are (N-1) possible break positions.
 * - 1-line: 1 candidate (the full text)
 * - 2-line: (N-1) candidates (one break point)
 * - 3-line: C(N-1, 2) candidates (two break points)
 *
 * Candidates that exceed maxCharsPerLine on any line are excluded.
 */
function generateCandidates(
  words: string[],
  maxCharsPerLine: number,
): string[][] {
  const candidates: string[][] = [];

  // 1-line candidate
  const fullText = words.join(' ');
  if (fullText.length <= maxCharsPerLine) {
    candidates.push([fullText]);
  }

  // 2-line candidates
  for (let i = 1; i < words.length; i++) {
    const line1 = words.slice(0, i).join(' ');
    const line2 = words.slice(i).join(' ');
    if (line1.length <= maxCharsPerLine && line2.length <= maxCharsPerLine) {
      candidates.push([line1, line2]);
    }
  }

  // 3-line candidates
  for (let i = 1; i < words.length - 1; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const line1 = words.slice(0, i).join(' ');
      const line2 = words.slice(i, j).join(' ');
      const line3 = words.slice(j).join(' ');
      if (
        line1.length <= maxCharsPerLine &&
        line2.length <= maxCharsPerLine &&
        line3.length <= maxCharsPerLine
      ) {
        candidates.push([line1, line2, line3]);
      }
    }
  }

  return candidates;
}

// ─── Scoring ────────────────────────────────────────────────────

/**
 * Check if a keepTogether phrase is split across lines.
 */
function checkPhraseIntegrity(
  lines: string[],
  keepTogether: string[],
): number {
  for (const phrase of keepTogether) {
    const phraseWords = phrase.toLowerCase().split(/\s+/);
    if (phraseWords.length <= 1) continue;

    // Check each line boundary for a split
    for (let lineIdx = 0; lineIdx < lines.length - 1; lineIdx++) {
      const lineWords = lines[lineIdx].toLowerCase().split(/\s+/);
      const nextLineWords = lines[lineIdx + 1].toLowerCase().split(/\s+/);

      for (let splitAt = 1; splitAt < phraseWords.length; splitAt++) {
        const prefix = phraseWords.slice(0, splitAt);
        const suffix = phraseWords.slice(splitAt);

        const endMatch = lineWords.length >= prefix.length &&
          prefix.every((w, k) => {
            const lw = lineWords[lineWords.length - prefix.length + k].replace(/[,.:;!?]$/, '');
            return lw === w;
          });
        const startMatch = nextLineWords.length >= suffix.length &&
          suffix.every((w, k) => {
            const nw = nextLineWords[k].replace(/[,.:;!?]$/, '');
            return nw === w;
          });

        if (endMatch && startMatch) {
          return -100; // Hard penalty — phrase is split
        }
      }
    }
  }
  return 0;
}

/**
 * Penalize lines that consist of a single weak word.
 */
function scoreWeakSoloLines(lines: string[]): number {
  let penalty = 0;
  for (const line of lines) {
    const trimmed = line.trim().toLowerCase().replace(/[,.:;!?]$/, '');
    const words = trimmed.split(/\s+/);
    if (words.length === 1 && WEAK_SOLO_WORDS.has(words[0])) {
      penalty -= 40;
    }
  }
  return penalty;
}

/**
 * Score visual balance — how evenly distributed are the line lengths?
 * Perfect balance (all same length) = +30.
 * Imbalanced = lower score.
 */
function scoreVisualBalance(lines: string[]): number {
  if (lines.length <= 1) return 30;

  const lengths = lines.map(l => l.length);
  const maxLen = Math.max(...lengths);
  const minLen = Math.min(...lengths);

  if (maxLen === 0) return 0;

  // Ratio of shortest to longest line
  const ratio = minLen / maxLen;

  // For 2-line: ratio > 0.5 is good, > 0.7 is great
  // For 3-line: ratio > 0.4 is good, > 0.6 is great
  if (lines.length === 2) {
    return Math.round(ratio * 30);
  }

  // For 3-line, also penalize if the middle line is much shorter than the others
  const midLen = lengths[1];
  const avgOuter = (lengths[0] + lengths[2]) / 2;
  const midRatio = avgOuter > 0 ? midLen / avgOuter : 1;
  const balanceScore = Math.round(ratio * 20);
  const midBonus = Math.round(Math.min(midRatio, 1) * 10);

  return balanceScore + midBonus;
}

/**
 * Bonus for breaking at natural grammatical pauses.
 * Breaking before "that", "which", "is", etc. is grammatically cleaner.
 */
function scoreGrammaticalBreaks(lines: string[]): number {
  if (lines.length <= 1) return 0;

  let bonus = 0;
  for (let i = 1; i < lines.length; i++) {
    const firstWord = lines[i].trim().split(/\s+/)[0]?.toLowerCase().replace(/[,.:;!?]$/, '');
    if (firstWord && GRAMMATICAL_BREAK_WORDS.has(firstWord)) {
      bonus += 8;
    }
  }
  return bonus;
}

/**
 * Strong preference for fewer lines (1 > 2 > 3).
 * Fewer lines = cleaner visual, larger font, less clutter.
 * Weighted heavily enough to overcome balance advantages of 3-line layouts,
 * so a readable 2-line break at the same font size always beats 3 lines.
 */
function scoreLineCountPreference(lineCount: number): number {
  if (lineCount === 1) return 25;
  if (lineCount === 2) return 18;
  return 0; // 3 lines = no bonus
}

/**
 * Score a single line-break candidate.
 */
function scoreCandidate(
  lines: string[],
  keepTogether: string[],
): { score: number; breakdown: ScoreBreakdown } {
  const phraseIntegrity = checkPhraseIntegrity(lines, keepTogether);
  const weakSoloLine = scoreWeakSoloLines(lines);
  const visualBalance = scoreVisualBalance(lines);
  const grammaticalBreak = scoreGrammaticalBreaks(lines);
  const lineCountPreference = scoreLineCountPreference(lines.length);

  const breakdown: ScoreBreakdown = {
    phraseIntegrity,
    weakSoloLine,
    visualBalance,
    grammaticalBreak,
    lineCountPreference,
  };

  const score =
    phraseIntegrity +
    weakSoloLine +
    visualBalance +
    grammaticalBreak +
    lineCountPreference;

  return { score, breakdown };
}

// ─── Main API ───────────────────────────────────────────────────

/**
 * Find the optimal line breaks for a T1 headline.
 *
 * Generates all valid candidates (1, 2, and 3-line layouts),
 * scores each one, and returns the best.
 *
 * @param text           The headline text to break
 * @param maxCharsPerLine Max characters that fit on one line at the given font size
 * @param keepTogether   Phrases that must not be split across lines
 * @param maxLines       Maximum number of lines allowed (default: 3)
 * @returns              The best candidate, or null if no valid candidate exists
 */
export function optimizeLineBreaks(
  text: string,
  maxCharsPerLine: number,
  keepTogether: string[] = [],
  maxLines: number = 3,
): LineBreakCandidate | null {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  // Generate all candidates
  let allCandidates = generateCandidates(words, maxCharsPerLine);

  // Filter to maxLines
  allCandidates = allCandidates.filter(c => c.length <= maxLines);

  if (allCandidates.length === 0) return null;

  // Score all candidates
  const scored: LineBreakCandidate[] = allCandidates.map(lines => {
    const { score, breakdown } = scoreCandidate(lines, keepTogether);
    return { lines, lineCount: lines.length, score, breakdown };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored[0];
}

/**
 * Get all scored candidates for debugging / reporting.
 * Returns candidates sorted best-first.
 */
export function getAllCandidates(
  text: string,
  maxCharsPerLine: number,
  keepTogether: string[] = [],
  maxLines: number = 3,
): LineBreakCandidate[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  let allCandidates = generateCandidates(words, maxCharsPerLine);
  allCandidates = allCandidates.filter(c => c.length <= maxLines);

  const scored: LineBreakCandidate[] = allCandidates.map(lines => {
    const { score, breakdown } = scoreCandidate(lines, keepTogether);
    return { lines, lineCount: lines.length, score, breakdown };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
