/**
 * TASK 3 — Text Overlay System
 *
 * Rules for line breaks, emphasis words, max words per line,
 * and color usage on carousel slides.
 */

import { COLOR_PALETTE } from './system';

// ─── Typography Scale ────────────────────────────────────────────

export interface TypographyStyle {
  role: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  textTransform: 'none' | 'uppercase';
  color: string;
  maxLines: number;
}

export const TYPOGRAPHY: Record<string, TypographyStyle> = {
  /** Main headline — the hook or key statement */
  headline: {
    role: 'headline',
    fontSize: 72,
    fontWeight: 800,
    lineHeight: 1.1,
    letterSpacing: -1.5,
    textTransform: 'none',
    color: COLOR_PALETTE.textPrimary,
    maxLines: 3,
  },
  /** Emphasis word within headline — colored accent */
  emphasisWord: {
    role: 'emphasis',
    fontSize: 72,
    fontWeight: 800,
    lineHeight: 1.1,
    letterSpacing: -1.5,
    textTransform: 'none',
    color: COLOR_PALETTE.accentPrimary,
    maxLines: 1,
  },
  /** Supporting body text beneath headline */
  body: {
    role: 'body',
    fontSize: 36,
    fontWeight: 400,
    lineHeight: 1.6,
    letterSpacing: 0,
    textTransform: 'none',
    color: COLOR_PALETTE.textSecondary,
    maxLines: 4,
  },
  /** Data callout — large number or statistic */
  dataCallout: {
    role: 'data-callout',
    fontSize: 96,
    fontWeight: 900,
    lineHeight: 1.0,
    letterSpacing: -2,
    textTransform: 'none',
    color: COLOR_PALETTE.accentPrimary,
    maxLines: 1,
  },
  /** CTA text at bottom of slide */
  cta: {
    role: 'cta',
    fontSize: 32,
    fontWeight: 600,
    lineHeight: 1.3,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLOR_PALETTE.accentSecondary,
    maxLines: 2,
  },
  /** Slide number or subtle label */
  label: {
    role: 'label',
    fontSize: 24,
    fontWeight: 500,
    lineHeight: 1.2,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: COLOR_PALETTE.textSecondary,
    maxLines: 1,
  },
};

// ─── Line Break Rules ────────────────────────────────────────────

export const LINE_BREAK_RULES = {
  /** Maximum words allowed on a single line */
  maxWordsPerLine: 7,

  /** Minimum words on a line (avoid orphans) */
  minWordsPerLine: 3,

  /** Break BEFORE these words to keep them with the next phrase */
  breakBefore: ['that', 'which', 'because', 'when', 'while', 'but'] as string[],

  /** Never break in the middle of these patterns */
  keepTogether: [
    /\d+[%xX]/,           // "50%", "10x"
    /\$[\d,.]+/,           // "$1,000"
    /\d+\s*(million|billion|trillion|k|M|B)/i,
    /[A-Z]{2,}/,           // Acronyms: "AI", "CEO"
  ],

  /**
   * Apply line-break rules to a text string.
   * Returns an array of lines.
   */
  breakIntoLines(text: string): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine: string[] = [];

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      currentLine.push(word);

      const nextWord = words[i + 1];
      const atMaxWords = currentLine.length >= LINE_BREAK_RULES.maxWordsPerLine;
      const nextIsBreakWord = nextWord && LINE_BREAK_RULES.breakBefore.includes(nextWord.toLowerCase());

      if (atMaxWords || (currentLine.length >= LINE_BREAK_RULES.minWordsPerLine && nextIsBreakWord)) {
        lines.push(currentLine.join(' '));
        currentLine = [];
      }
    }

    if (currentLine.length > 0) {
      // Avoid orphan: merge with previous line if only 1 word
      if (currentLine.length === 1 && lines.length > 0) {
        const prevLine = lines.pop()!;
        const prevWords = prevLine.split(' ');
        if (prevWords.length > LINE_BREAK_RULES.minWordsPerLine) {
          // Move last word of prev line to current line
          const moved = prevWords.pop()!;
          lines.push(prevWords.join(' '));
          lines.push(`${moved} ${currentLine[0]}`);
        } else {
          lines.push(prevLine);
          lines.push(currentLine.join(' '));
        }
      } else {
        lines.push(currentLine.join(' '));
      }
    }

    return lines;
  },
} as const;

// ─── Emphasis Rules ──────────────────────────────────────────────

export interface EmphasisResult {
  /** The full text with emphasis markers */
  segments: Array<{ text: string; isEmphasis: boolean }>;
}

export const EMPHASIS_RULES = {
  /** Max emphasized words per slide — more than this dilutes impact */
  maxEmphasisWords: 2,

  /** Words that should NEVER be emphasized (too common) */
  neverEmphasize: ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'it', 'this', 'that', 'to', 'of', 'in', 'for', 'on', 'with'] as string[],

  /** Word categories that SHOULD be emphasized when present */
  emphasisCandidates: {
    /** Numbers and statistics always pop */
    numbers: /\b\d+[%xXkKmMbB]?\b/,
    /** Power words that carry emotional weight */
    powerWords: [
      'never', 'always', 'every', 'only', 'secret', 'hidden', 'wrong', 'mistake',
      'truth', 'lie', 'real', 'fake', 'dead', 'alive', 'free', 'lost', 'found',
      'kill', 'build', 'break', 'crush', 'dominate', 'fail', 'win', 'stop',
    ] as string[],
    /** Domain-specific tech words */
    techWords: ['AI', 'GPT', 'data', 'code', 'API', 'cloud', 'scale', 'automate'],
  },

  /**
   * Identify which words in a headline should be emphasized.
   */
  findEmphasisWords(text: string): EmphasisResult {
    const words = text.split(/\s+/);
    let emphasisCount = 0;

    const segments = words.map(word => {
      if (emphasisCount >= EMPHASIS_RULES.maxEmphasisWords) {
        return { text: word, isEmphasis: false };
      }

      const cleanWord = word.replace(/[^a-zA-Z0-9%$]/g, '').toLowerCase();

      if (EMPHASIS_RULES.neverEmphasize.includes(cleanWord)) {
        return { text: word, isEmphasis: false };
      }

      const isNumber = EMPHASIS_RULES.emphasisCandidates.numbers.test(word);
      const isPower = EMPHASIS_RULES.emphasisCandidates.powerWords.includes(cleanWord);
      const isTech = EMPHASIS_RULES.emphasisCandidates.techWords
        .some(tw => tw.toLowerCase() === cleanWord);

      if (isNumber || isPower || isTech) {
        emphasisCount++;
        return { text: word, isEmphasis: true };
      }

      return { text: word, isEmphasis: false };
    });

    return { segments };
  },
} as const;

// ─── Color Usage Rules ───────────────────────────────────────────

export const TEXT_COLOR_RULES = {
  /** Slide role → text color mapping */
  roleColors: {
    HOOK: {
      headline: COLOR_PALETTE.textEmphasis,
      emphasis: COLOR_PALETTE.accentPrimary,
      body: COLOR_PALETTE.textSecondary,
    },
    SETUP: {
      headline: COLOR_PALETTE.textPrimary,
      emphasis: COLOR_PALETTE.accentPrimary,
      body: COLOR_PALETTE.textSecondary,
    },
    BUILD: {
      headline: COLOR_PALETTE.textPrimary,
      emphasis: COLOR_PALETTE.accentSecondary,
      body: COLOR_PALETTE.textSecondary,
    },
    TWIST: {
      headline: COLOR_PALETTE.textEmphasis,
      emphasis: COLOR_PALETTE.accentWarm,
      body: COLOR_PALETTE.textPrimary,
    },
    INSIGHT: {
      headline: COLOR_PALETTE.textPrimary,
      emphasis: COLOR_PALETTE.accentPrimary,
      body: COLOR_PALETTE.textSecondary,
    },
    CTA: {
      headline: COLOR_PALETTE.accentSecondary,
      emphasis: COLOR_PALETTE.textEmphasis,
      body: COLOR_PALETTE.textSecondary,
    },
  } as Record<string, Record<string, string>>,

  /** Fallback for unknown roles */
  defaultColors: {
    headline: COLOR_PALETTE.textPrimary,
    emphasis: COLOR_PALETTE.accentPrimary,
    body: COLOR_PALETTE.textSecondary,
  },

  /**
   * Get the color set for a given slide role.
   */
  getColorsForRole(role: string): Record<string, string> {
    return TEXT_COLOR_RULES.roleColors[role.toUpperCase()] ?? TEXT_COLOR_RULES.defaultColors;
  },
} as const;

// ─── Unified Text Overlay System Export ──────────────────────────

export const TEXT_OVERLAY_SYSTEM = {
  typography: TYPOGRAPHY,
  lineBreaks: LINE_BREAK_RULES,
  emphasis: EMPHASIS_RULES,
  colorRules: TEXT_COLOR_RULES,
} as const;
