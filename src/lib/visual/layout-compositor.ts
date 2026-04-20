/**
 * Layout-First Compositor — Stacked Image + Text Bar
 *
 * Vertically stacked layout with strict separation:
 *   - Top: AI-generated image (1080 × 1030)
 *   - Bottom: solid dark text bar (1080 × 320)
 *   - Total: 1080 × 1350 (Instagram 4:5)
 *
 * The image is generated at EXACTLY the image region size.
 * No cropping. No composition directives for text space.
 * Gemini/Stability generates the full scene inside 1080×1030.
 *
 * ┌──────────────────────────────┐  y=0
 * │                              │
 * │     AI-GENERATED IMAGE       │
 * │     1080 × 1030              │
 * │     full scene, no crop      │
 * │     no text zone needed      │
 * │                              │
 * ├──────────────────────────────┤  y=1030
 * │                              │
 * │  TEXT BAR  (#1A1A1A)         │
 * │  1080 × 320                  │
 * │  white Inter headline        │
 * │  white 80% support line      │
 * │                              │
 * └──────────────────────────────┘  y=1350
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp');
import type { ImageGenerator, ImageGenerationResult } from '../ai/image-provider';
import type { ImageGenerationOptions } from '../ai/types';

// ─── Layout Constants ────────────────────────────────────────────

export const CANVAS = { width: 1080, height: 1350 };

/** Image region — top portion, full width */
export const IMAGE_REGION = {
  width: 1080,
  height: 1030,
  y: 0,
};

/** Text bar — bottom portion, full width */
export const TEXT_BAR = {
  width: 1080,
  height: 320,
  y: 1030,           // starts immediately below the image
  color: '#000000',  // pure black
  paddingX: 65,      // 6% of 1080 = ~65px horizontal padding
  paddingTop: 40,    // top padding inside bar
};

// ─── Types ───────────────────────────────────────────────────────

export interface LayoutCompositeResult {
  /** Final composited slide (image + bar, no text overlay yet) */
  image: Buffer;
  /** Which provider generated the image */
  imageSource: ImageGenerationResult['imageSource'];
  /** Provider metadata */
  meta: ImageGenerationResult['meta'];
  /** Error from primary provider if fallback was used */
  providerError?: string;
  /** HTTP status that triggered fallback */
  providerErrorStatus?: number;
  /** Layout-first pipeline was used */
  layoutFirst: true;
}

// ─── Prompt Simplification ───────────────────────────────────────

/**
 * Convert a 5-layer image prompt into a compact plain-language prompt
 * optimized for Gemini image generation.
 *
 * Strips layer labels (CORE SCENE:, COMPOSITION:, etc.) and collapses
 * the prompt into 4 parts:
 *   1. Scene description (from CORE SCENE)
 *   2. Visual emphasis (from VISUAL PRIORITY)
 *   3. Photography style (from STYLE)
 *   4. Minimal exclusions: "No text, no watermarks, no labels."
 *
 * Drops: COMPOSITION (frame-filling is handled by aspect ratio),
 *        verbose negative instructions, redundant directives.
 */
// Core structural negatives always appended — these must reach the model.
const CORE_NEGATIVE =
  'No frames, no borders, no white bars, no white background panels, no split-screen, no diptych, no triptych, no side-by-side panels, no collage, no text, no captions, no watermarks, no logos.';

export function simplifyPromptForGemini(prompt: string): string {
  const layers = prompt.split(/(?=CORE SCENE:|COMPOSITION:|VISUAL PRIORITY:|STYLE:|NEGATIVE PROMPT:)/);

  let scene = '';
  let emphasis = '';
  let style = '';

  for (const layer of layers) {
    const trimmed = layer.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('CORE SCENE:')) {
      scene = trimmed.replace(/^CORE SCENE:\s*/, '').trim();
    } else if (trimmed.startsWith('VISUAL PRIORITY:')) {
      emphasis = trimmed.replace(/^VISUAL PRIORITY:\s*/, '').trim();
    } else if (trimmed.startsWith('STYLE:')) {
      style = trimmed.replace(/^STYLE:\s*/, '').trim();
    }
    // COMPOSITION is dropped — frame-filling is handled by aspect ratio.
    // NEGATIVE PROMPT is replaced by the authoritative CORE_NEGATIVE constant above.
  }

  // If the prompt doesn't use 5-layer format, return it cleaned up
  if (!scene) {
    // Strip any layer labels that might be present and clean up
    return prompt
      .replace(/\b(CORE SCENE|COMPOSITION|VISUAL PRIORITY|STYLE|NEGATIVE PROMPT):\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const parts = [scene, emphasis, style].filter(Boolean);
  parts.push(CORE_NEGATIVE);

  return parts.join(' ');
}

/** @deprecated Use simplifyPromptForGemini instead */
export const rewritePromptForSubjectOnly = simplifyPromptForGemini;

// ─── Bar Color Selection ─────────────────────────────────────────

/**
 * Select bar color. Near-black for most images.
 * Slightly lighter for very dark images.
 */
async function selectBarColor(imageBuffer: Buffer): Promise<string> {
  try {
    const stats = await sharp(imageBuffer).stats();
    const brightness = 0.299 * (stats.channels[0]?.mean ?? 128)
      + 0.587 * (stats.channels[1]?.mean ?? 128)
      + 0.114 * (stats.channels[2]?.mean ?? 128);

    if (brightness < 60) return '#0A0A0A'; // near-black for very dark images
    return '#000000'; // pure black default
  } catch {
    return '#1A1A1A';
  }
}

// ─── Composition ─────────────────────────────────────────────────

/**
 * Assemble the final slide:
 *   1. Resize generated image to exactly 1080×1030 (image region)
 *   2. Create a 1080×1350 canvas
 *   3. Place image at top (y=0)
 *   4. Place solid dark bar at bottom (y=1030)
 *
 * No overlap. No gradient. Pure stacking.
 */
async function assembleSlide(
  imageBuffer: Buffer,
  barColor: string,
): Promise<Buffer> {
  const inputMeta = await sharp(imageBuffer).metadata();
  console.log(`[LayoutCompositor] Image input: ${inputMeta.width}x${inputMeta.height}`);

  // Step 1: Resize image to exact image region (cover crop, center)
  const imageRegion = await sharp(imageBuffer)
    .resize(IMAGE_REGION.width, IMAGE_REGION.height, {
      fit: 'cover',
      position: 'centre',
    })
    .png()
    .toBuffer();

  console.log(`[LayoutCompositor] Image region: ${IMAGE_REGION.width}x${IMAGE_REGION.height}`);

  // Step 2: Create full canvas with dark bar as base
  const canvasSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}">
    <rect x="0" y="0" width="${CANVAS.width}" height="${CANVAS.height}" fill="${barColor}"/>
  </svg>`;

  const canvas = await sharp(Buffer.from(canvasSvg))
    .png()
    .toBuffer();

  // Step 3: Place image at top of canvas
  const composited = await sharp(canvas)
    .composite([
      {
        input: imageRegion,
        top: IMAGE_REGION.y,
        left: 0,
      },
    ])
    .png()
    .toBuffer();

  const outMeta = await sharp(composited).metadata();
  console.log(`[LayoutCompositor] Output: ${outMeta.width}x${outMeta.height}`);
  console.log(`[LayoutCompositor] Layout: image y=0–${IMAGE_REGION.height}px | bar y=${TEXT_BAR.y}–${CANVAS.height}px (${TEXT_BAR.height}px, ${barColor})`);

  return composited;
}

// ─── Full-Bleed API (Bold Layout) ────────────────────────────────

/**
 * Subject-safe base image for the Bold layout.
 *
 * Gemini is asked for a 1:1 image, which concentrates the subject near the
 * square's center. We fit that square into the top 75% of the 1080×1350
 * slide (1080×1013) anchored to the top — so the subject lands around the
 * slide's ~35% mark, comfortably above all text. The bottom 337px is pure
 * black so text has a fully legible backdrop. The gradient overlay in
 * bold-slide-renderer fades to 100% black at the 75% seam, which is why the
 * darkening reads as continuous, not as two stacked regions.
 */
const BOLD_IMAGE_FILL_HEIGHT = Math.round(CANVAS.height * 0.75); // 1013

export async function generateFullBleedImage(
  originalPrompt: string,
  imageProvider: ImageGenerator,
  options?: ImageGenerationOptions,
): Promise<LayoutCompositeResult> {
  const subjectPrompt = simplifyPromptForGemini(originalPrompt);
  console.log(`[LayoutCompositor:FullBleed] Prompt (${subjectPrompt.length} chars): ${subjectPrompt.slice(0, 150)}...`);

  const result = await imageProvider.generateImage(subjectPrompt, {
    ...options,
    width: 1024,
    height: 1024,
  });

  console.log(`[LayoutCompositor:FullBleed] Generated via ${result.imageSource} (${result.meta.durationMs}ms)`);

  // Fit the 1:1 image into the top 75% (1080×1013). `position: top`
  // anchors the subject high — cover-cropping trims the bottom edge of
  // the square, which is the area we darken anyway.
  const topImage = await sharp(result.data)
    .resize(CANVAS.width, BOLD_IMAGE_FILL_HEIGHT, {
      fit: 'cover',
      position: 'top',
    })
    .png()
    .toBuffer();

  // Paste on a pure black canvas; remaining 337px below stays black so
  // the gradient overlay can fade to it seamlessly.
  const fullBleed = await sharp({
    create: {
      width: CANVAS.width,
      height: CANVAS.height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite([{ input: topImage, top: 0, left: 0 }])
    .png()
    .toBuffer();

  const outMeta = await sharp(fullBleed).metadata();
  console.log(`[LayoutCompositor:FullBleed] Output: ${outMeta.width}x${outMeta.height} (image top ${BOLD_IMAGE_FILL_HEIGHT}px)`);

  return {
    image: fullBleed,
    imageSource: result.imageSource,
    meta: result.meta,
    providerError: result.providerError,
    providerErrorStatus: result.providerErrorStatus,
    layoutFirst: true,
  };
}

// ─── Main API ────────────────────────────────────────────────────

/**
 * Generate a stacked slide: image on top, text bar on bottom.
 *
 * Pipeline:
 *   1. Rewrite prompt (remove text-space directives)
 *   2. Generate image at ~1:1 aspect (provider returns its native size)
 *   3. Cover-crop to 1080×1030 (image region)
 *   4. Stack onto canvas with dark bar below
 *
 * Image and text occupy separate regions. No overlap.
 */
export async function generateLayoutFirstImage(
  originalPrompt: string,
  imageProvider: ImageGenerator,
  options?: ImageGenerationOptions,
): Promise<LayoutCompositeResult> {
  const subjectPrompt = simplifyPromptForGemini(originalPrompt);
  console.log(`[LayoutCompositor] Prompt (${subjectPrompt.length} chars): ${subjectPrompt.slice(0, 150)}...`);

  // Generate image — request 3:4 portrait to match the tall image region (1080×1030)
  // 3:4 portrait gives more vertical content, reducing crop loss vs 1:1
  const result = await imageProvider.generateImage(subjectPrompt, {
    ...options,
    width: 768,
    height: 1024,
  });

  console.log(`[LayoutCompositor] Generated via ${result.imageSource} (${result.meta.durationMs}ms)`);

  const barColor = await selectBarColor(result.data);
  console.log(`[LayoutCompositor] Bar color: ${barColor}`);

  const composited = await assembleSlide(result.data, barColor);

  return {
    image: composited,
    imageSource: result.imageSource,
    meta: result.meta,
    providerError: result.providerError,
    providerErrorStatus: result.providerErrorStatus,
    layoutFirst: true,
  };
}
