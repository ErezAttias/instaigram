/**
 * Baked-text prompt builder.
 *
 * Builds the gpt-image-1 prompt for slides where the text is rendered into
 * the image itself (no SVG overlay later). Inflates a Style Bible into a
 * full design brief, quotes the literal text the model must render, and —
 * for slides 2..N — instructs the model to match a supplied reference image.
 */

import type { StyleBible } from '@/lib/ai/style-bible';

export interface BakedPromptInput {
  slideRole: string;            // 'OPENER' | 'FACT' | 'CTA' | 'IMPLICATION' | ...
  slideIndex: number;           // 0-based
  totalSlides: number;
  topic: string;
  displayTitle: string;
  displaySupport?: string;
  swipeCta?: string;
  styleBible: StyleBible;
  /** True for slide 1 (no reference image — first call defines the look). */
  isAnchor: boolean;
  /**
   * The named entity this slide is about — pulled from `slide.topicEntity`.
   * If set, the model is instructed to feature it as the hero subject of
   * the composition (e.g. "Nina Simone", "Bohemian Rhapsody", "Mozart").
   * Without this the model often defaults to abstract decorative graphics.
   */
  heroSubject?: string;
  /**
   * Design memo extracted from slide 1's rendered PNG by a vision call.
   * Carries the chosen design system (palette, typography, layout) into
   * slides 2..N as a STYLE LOCK block. Undefined for slide 1 — that slide
   * is generated freely and seeds the memo for the rest.
   */
  designMemo?: string;
}

// Mirrors the 180-char cap in CompressedSlideDisplay.displaySupport (schema).
// Anything past this gets visibly clipped by gpt-image-1 mid-word.
const HARD_SUPPORT_LIMIT = 180;
// Title cap. Past this, gpt-image-1 starts wrapping awkwardly or breaking
// glyphs ("HIPPANCMPAMI" instead of "HIPPOCAMPI"). Tighter than schema (60).
const HARD_TITLE_LIMIT = 55;

/**
 * Default visual style for every carousel. Hard-coded for now; can become a
 * per-carousel field later. Used by both Phase 1 (design board) and Phase 2
 * (per-slide regen) so the model anchors on the same aesthetic across the
 * whole flow.
 */
export const DEFAULT_CAROUSEL_STYLE = 'cinematic';

// ─── Phase-1 / Phase-2 design-board prompt builders ─────────────

export interface DesignBoardSlide {
  slideIndex: number;
  role: string;
  displayTitle: string;
  displaySupport?: string;
  swipeCta?: string;
}

const BOARD_PANEL_POSITIONS = [
  'top-left', 'top-right',
  'middle-left', 'middle-right',
  'bottom-left', 'bottom-right',
] as const;

function clampForBoard(s: string | undefined, max: number): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

/**
 * Phase 1 — ask gpt-image-1 to design a SET of all 6 cinematic slides as a
 * single 1024×1536 image (2 columns × 3 rows). The model designs the whole
 * set holistically, so cohesion is built in by construction.
 */
export function buildDesignBoardPrompt(slides: DesignBoardSlide[]): string {
  const ordered = slides.slice().sort((a, b) => a.slideIndex - b.slideIndex);
  const slideBlocks = ordered.map((s, i) => {
    const pos = BOARD_PANEL_POSITIONS[i] ?? `panel ${i + 1}`;
    const title = clampForBoard(s.displayTitle, HARD_TITLE_LIMIT);
    const support = clampForBoard(s.displaySupport, HARD_SUPPORT_LIMIT);
    const lines = [`Slide ${i + 1} (${pos}):`, `Headline: ${title}`];
    if (support) lines.push(`Body: ${support}`);
    if (s.swipeCta) lines.push(`Swipe CTA: ${s.swipeCta}`);
    return lines.join('\n');
  });

  return [
    `Design a SET of 6 beautiful, cinematic Instagram carousel slides. The slides share only two things across the set: the same typography and the same photographic style. Every other visual choice — composition, palette, lighting, subject treatment — can vary slide to slide.`,
    ``,
    `Present the SET as a single 1024×1536 design board, arranged 2 columns × 3 rows: slide 1 top-left, slide 2 top-right, slide 3 middle-left, slide 4 middle-right, slide 5 bottom-left, slide 6 bottom-right.`,
    ``,
    `Render each slide's text directly on its panel.`,
    ``,
    ...slideBlocks.flatMap(b => [b, '']),
  ].join('\n').trimEnd();
}

/**
 * Phase 2 — for each slide, ask gpt-image-1 to take ONE panel of the design
 * board and render it at full 1024×1536 resolution. Board passed as the
 * `image` reference so design language is preserved literally.
 */
export function buildSlideFromBoardPrompt(input: {
  slideIndex: number;
  totalSlides: number;
  displayTitle: string;
  displaySupport?: string;
  swipeCta?: string;
  isOpener: boolean;
}): string {
  const { slideIndex, totalSlides, displayTitle, displaySupport, swipeCta, isOpener } = input;
  const pos = BOARD_PANEL_POSITIONS[slideIndex] ?? `panel ${slideIndex + 1}`;
  const title = clampForBoard(displayTitle, HARD_TITLE_LIMIT);
  const support = clampForBoard(displaySupport, HARD_SUPPORT_LIMIT);

  const textLines = [`Headline: ${title}`];
  if (support) textLines.push(`Body: ${support}`);
  if (isOpener && swipeCta) textLines.push(`Swipe CTA: ${swipeCta}`);

  return [
    `The supplied reference image is a SET of 6 beautiful, cinematic Instagram carousel slides arranged 2 columns × 3 rows.`,
    ``,
    `Take panel ${slideIndex + 1} (${pos}) and render it as a single full-size 1024×1536 Instagram slide. Match the SET's typography and photographic style exactly; everything else (composition, palette, lighting, subject treatment) can stay as designed in that panel.`,
    ``,
    `Slide text:`,
    ...textLines,
  ].join('\n');
}

export function buildBakedPrompt(input: BakedPromptInput): string {
  const {
    slideRole, slideIndex, totalSlides, topic,
    displayTitle, displaySupport, swipeCta,
    styleBible, isAnchor, heroSubject, designMemo,
  } = input;

  // gpt-image-1 occasionally paraphrases body text past the hard limit at
  // quality:high. Truncate before passing in so what reaches the model fits.
  const support = (displaySupport ?? '').length > HARD_SUPPORT_LIMIT
    ? displaySupport!.slice(0, HARD_SUPPORT_LIMIT - 1).trimEnd() + '\u2026'
    : displaySupport ?? '';

  // Same belt-and-braces clamp for the headline. Schema caps at 60 but copy
  // sometimes slips through at the boundary; we also want to short-circuit
  // long titles inherited from older carousels.
  const title = displayTitle.length > HARD_TITLE_LIMIT
    ? displayTitle.slice(0, HARD_TITLE_LIMIT - 1).trimEnd() + '\u2026'
    : displayTitle;

  const role = slideRole.toUpperCase();
  // CTA slides ("Follow for more\u2026") often pick up a hallucinated subtitle from
  // the model ("Follow for more" baked twice). Mute the support line for them.
  const isCta = role === 'CTA';
  const titleHasFollow = /\bfollow\b/i.test(title);
  const suppressSupport = isCta || (titleHasFollow && !support);
  const effectiveSupport = suppressSupport ? '' : support;
  const slideLabel = `slide ${slideIndex + 1} of ${totalSlides}`;
  const sb = styleBible;

  const isOpener = role === 'OPENER';
  // Quiet TS — these inputs are intentionally unused in this minimal mode.
  void styleBible; void heroSubject; void isAnchor; void isCta; void designMemo; void topic;

  // ─── EXPERIMENT: ZERO instructions, content-only prompt ─────────
  // No CRITICAL rules, no LAYOUT, no TYPOGRAPHY, no VISUAL, no STYLE,
  // no DO NOT, no STYLE LOCK. Just slide context + the literal text the
  // model needs to render. We're testing whether GPT designs better when
  // given complete creative freedom over everything except the content.
  const sections: (string | null)[] = [
    `Instagram carousel slide ${slideIndex + 1} of ${totalSlides}.`,
    ``,
    `Headline:`,
    title,
    effectiveSupport ? `\nBody:\n${effectiveSupport}` : null,
    isOpener && swipeCta ? `\nSwipe CTA:\n${swipeCta}` : null,
  ];

  return sections.filter((s): s is string => s !== null).join('\n');
}
