/**
 * Baked-text slide renderer.
 *
 * Drop-in for `renderBoldSlide` when `CarouselJob.layout === 'BAKED'`.
 * gpt-image-1 produces the entire slide — text and all — in one shot. No
 * SVG overlay step; the returned buffer IS the final image.
 *
 * Style continuity is enforced via a design memo (extracted from slide 1
 * by a vision call) that the caller passes into `designMemo` for slides
 * 2..N. Every slide goes through `images.generate` — no `images.edit`,
 * no reference image. The memo replaces the reference-image mechanism
 * that previously dragged down design energy on follow-up slides.
 */

import type { AICallMeta } from '@/lib/ai/logger';
import type { ImageGenerator } from '@/lib/ai/image-provider';
import type { StyleBible } from '@/lib/ai/style-bible';
import {
  buildBakedPrompt,
  buildDesignBoardPrompt,
  buildSlideFromBoardPrompt,
  type BakedPromptInput,
  type DesignBoardSlide,
} from './baked-prompt-builder';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp');

const CANVAS_W = 1080;
const CANVAS_H = 1350;

export interface BakedSlideInput {
  slideRole: string;
  slideIndex: number;
  totalSlides: number;
  topic: string;
  displayTitle: string;
  displaySupport?: string;
  swipeCta?: string;
  styleBible: StyleBible;
  /** Named entity that this slide is about (e.g. "Nina Simone"). Forwarded
   *  into the prompt so the model puts the entity on the slide instead of
   *  defaulting to abstract decorative graphics. */
  heroSubject?: string;
  /** Design memo extracted from slide 1's rendered PNG. Carries the design
   *  system (palette, typography, layout) into slides 2..N so cohesion is
   *  enforced at the prompt level instead of via images.edit. Undefined for
   *  slide 1 (which is generated freely and seeds the memo). */
  designMemo?: string;
}

export interface BakedSlideRenderResult {
  image: Buffer;
  meta: AICallMeta;
}

/**
 * Render a single baked-text slide via gpt-image-1.
 *
 * Every slide goes through `images.generate` — slide 1 with no design memo,
 * slides 2..N with the memo extracted from slide 1's rendered PNG. The
 * previous reference-image flow (`images.edit` + `input_fidelity: 'low'`)
 * has been removed: it produced more conservative, lower-design-energy
 * output than `generate`, and slide 1 was consistently the strongest slide
 * because it was the only one going through `generate`.
 */
export async function renderBakedSlide(
  input: BakedSlideInput,
  imageProvider: ImageGenerator,
): Promise<BakedSlideRenderResult> {
  const promptInput: BakedPromptInput = {
    slideRole: input.slideRole,
    slideIndex: input.slideIndex,
    totalSlides: input.totalSlides,
    topic: input.topic,
    displayTitle: input.displayTitle,
    displaySupport: input.displaySupport,
    swipeCta: input.swipeCta,
    styleBible: input.styleBible,
    isAnchor: input.slideIndex === 0,
    heroSubject: input.heroSubject,
    designMemo: input.designMemo,
  };

  const prompt = buildBakedPrompt(promptInput);

  const result = await imageProvider.generateImage(prompt, {
    width: CANVAS_W,
    height: CANVAS_H,
    slideRole: input.slideRole,
  });

  // gpt-image-1's nearest portrait size is 1024×1536 (2:3). Our delivery
  // frame is 1080×1350 (4:5). Center-crop to 4:5 and resize to the canvas
  // so the saved image matches the display frame exactly — no display-time
  // cover-cropping that would clip baked-in text.
  const normalized = await sharp(result.data)
    .resize(CANVAS_W, CANVAS_H, { fit: 'cover', position: 'centre', kernel: 'lanczos3' })
    .png()
    .toBuffer();

  return { image: normalized, meta: result.meta };
}

// ─── Design-board rendering (Phase 1 / Phase 2 of the new flow) ─────

export interface DesignBoardRenderResult {
  image: Buffer;        // raw 1024×1536 design board (NOT cropped to 4:5)
  meta: AICallMeta;
}

/**
 * Phase 1 — generate a SET of all 6 cinematic slides as a single 1024×1536
 * design board (2 cols × 3 rows). The board is the cohesion mechanism: by
 * designing all 6 panels together in one image, the model produces a
 * naturally consistent set.
 *
 * Returned buffer is left at the raw 1024×1536 size (no 4:5 crop) — Phase 2
 * uses the whole board as a reference image for each per-slide regen.
 */
export async function renderDesignBoard(
  slides: DesignBoardSlide[],
  imageProvider: ImageGenerator,
): Promise<DesignBoardRenderResult> {
  const prompt = buildDesignBoardPrompt(slides);
  const result = await imageProvider.generateImage(prompt, {
    width: 1024,
    height: 1536,
    slideRole: 'DESIGN_BOARD',
  });
  return { image: result.data, meta: result.meta };
}

export interface SlideFromBoardInput {
  slideRole: string;
  slideIndex: number;
  totalSlides: number;
  displayTitle: string;
  displaySupport?: string;
  swipeCta?: string;
}

/**
 * Phase 2 — regenerate a single slide at full 1024×1536 resolution by
 * pointing the model at one panel of the supplied design board. The board
 * image is passed as a reference (`images.edit`) so the design language is
 * preserved literally; the prompt provides the slide's text content.
 */
export async function renderSlideFromBoard(
  input: SlideFromBoardInput,
  board: Buffer,
  imageProvider: ImageGenerator,
): Promise<BakedSlideRenderResult> {
  const prompt = buildSlideFromBoardPrompt({
    slideIndex: input.slideIndex,
    totalSlides: input.totalSlides,
    displayTitle: input.displayTitle,
    displaySupport: input.displaySupport,
    swipeCta: input.swipeCta,
    isOpener: input.slideRole === 'OPENER',
  });

  const result = await imageProvider.generateImage(prompt, {
    width: CANVAS_W,
    height: CANVAS_H,
    slideRole: input.slideRole,
    referenceImages: [board],
    inputFidelity: 'high',
  });

  // Same 4:5 crop pass as renderBakedSlide.
  const normalized = await sharp(result.data)
    .resize(CANVAS_W, CANVAS_H, { fit: 'cover', position: 'centre', kernel: 'lanczos3' })
    .png()
    .toBuffer();

  return { image: normalized, meta: result.meta };
}

/**
 * Phase 2 (primary) — render a single slide at full 1024×1536 resolution
 * from a DETAILED STRUCTURED TEXT PROMPT extracted from the design board
 * by Claude vision. Uses `images.generate` (not `images.edit`) — the prompt
 * already encodes typography/layout/colors explicitly, so we don't need a
 * reference image to copy from. Result: typography fidelity matches the
 * board because the directives are unambiguous text instructions.
 */
export async function renderSlideFromExtractedPrompt(
  prompt: string,
  slideRole: string,
  imageProvider: ImageGenerator,
): Promise<BakedSlideRenderResult> {
  const result = await imageProvider.generateImage(prompt, {
    width: CANVAS_W,
    height: CANVAS_H,
    slideRole,
  });

  const normalized = await sharp(result.data)
    .resize(CANVAS_W, CANVAS_H, { fit: 'cover', position: 'centre', kernel: 'lanczos3' })
    .png()
    .toBuffer();

  return { image: normalized, meta: result.meta };
}
