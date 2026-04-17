/**
 * Slide Renderer — Full-Bleed Image + Title + Subtitle
 *
 * The single renderer for all carousel slides. Full-bleed image
 * with big title and smaller subtitle overlaid via a heavy gradient.
 *
 * Layout:
 *   ┌──────────────────────────────┐ y=0
 *   │                              │
 *   │   FULL-BLEED IMAGE           │
 *   │   1080 × 1350               │
 *   │                              │
 *   │         ░░░░░░░░░░░░░░░░░░░  │ ← gradient starts ~60%
 *   │         ██████████████████   │
 *   │         DISPLAY TITLE        │ ← 90px bold
 *   │         display subtitle     │ ← 40px regular
 *   │         ██████████████████   │
 *   └──────────────────────────────┘ y=1350
 *
 * Flow:
 *   1. Generate/receive base image (full-bleed 1080×1350)
 *   2. Build SVG overlay: gradient + title + subtitle
 *   3. Composite with sharp
 *   4. Export 1080×1350 PNG
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp');
import type { ImageGenerator, ImageSourceProvider } from '../ai/image-provider';
import { ProviderFailedError } from '../ai/retry';
import { generateFullBleedImage } from './layout-compositor';
import { type ChannelVisualStyleContext, DEFAULT_VISUAL_STYLE } from './visual-style';
import { getTitleFont, buildFontStyleBlock } from './font-pairings';
import { buildLogoCompositeInput } from './logo-compositor';

// ─── Constants ──────────────────────────────────────────────────

const CANVAS = { width: 1080, height: 1350 };

/** Bold layout typography */
const BOLD_FONT = {
  title: { size: 90, weight: 800, lineHeight: 1.15 },
  cta: { size: 44, weight: 500, lineHeight: 1.3 },
};

// ─── Types ──────────────────────────────────────────────────────

export interface BoldSlideInput {
  /** The 5-layer image prompt */
  imagePrompt: string;
  /** Display title — big bold text */
  displayTitle: string;
  /** Display subtitle — smaller text below the title */
  displaySubtitle?: string;
  /** Slide role (OPENER, FACT, IMPLICATION, CTA) */
  slideRole: string;
  /** Swipe CTA text for OPENER slides */
  swipeCta?: string;
  /** Subject name for Wikipedia image lookup */
  subjectName?: string;
  /** URLs already used by sibling slides */
  excludeUrls?: string[];
  /** Per-channel visual style */
  visualStyle?: ChannelVisualStyleContext;
  /** Pre-existing base image (for restyle) */
  baseImage?: Buffer;
  /**
   * User-picked Wikipedia image URL. When set, bypasses the image provider
   * entirely — the URL is downloaded and resized to the canvas directly.
   */
  forcedImageUrl?: string;
  /**
   * Attribution text rendered as a small caption (top-right corner).
   * Required by CC-BY licensing for Wikipedia images.
   */
  attributionText?: string;
}

export interface BoldSlideRenderResult {
  approved: boolean;
  image?: Buffer;
  rawImage?: Buffer;
  imageSource?: ImageSourceProvider;
  imageModel?: string;
  imageSourceUrl?: string;
  providerError?: string;
  providerErrorStatus?: number;
  visualMissing?: boolean;
  error?: string;
}

// ─── SVG Helpers ────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Wrap text into lines that fit within maxChars per line.
 */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current: string[] = [];

  for (const word of words) {
    const test = [...current, word].join(' ');
    if (test.length > maxChars && current.length > 0) {
      lines.push(current.join(' '));
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length > 0) lines.push(current.join(' '));
  return lines;
}

/**
 * Build the SVG overlay for a bold-layout slide.
 * Heavy gradient at bottom + big centered title text.
 */
function buildBoldOverlay(
  input: BoldSlideInput,
  style: ChannelVisualStyleContext = DEFAULT_VISUAL_STYLE,
): string {
  const t1Color = style.headlineColor ?? '#FFFFFF';
  const t2Color = style.bodyColor ?? '#D0D0D0';
  const titleFont = getTitleFont(style.titleFontId);
  const displayFontFamily = `'${titleFont.family}', sans-serif`;

  const t1Size = Math.min(style?.t1FontSizePx ?? BOLD_FONT.title.size, BOLD_FONT.title.size);
  const PAD = 65;
  const contentWidth = CANVAS.width - PAD * 2;

  // Character width estimation for wrapping
  const CHAR_WIDTH = 0.53;
  const maxChars = Math.floor(contentWidth / (t1Size * CHAR_WIDTH));
  const titleLines = wrapText(input.displayTitle, maxChars);

  // Calculate text block dimensions
  const lineHeight = t1Size * BOLD_FONT.title.lineHeight;
  const titleBlockHeight = t1Size + (titleLines.length - 1) * lineHeight;

  // Subtitle (displaySupport) for FACT slides
  const subtitleSize = 40;
  const subtitleLineHeight = subtitleSize * 1.35;
  const hasSubtitle = !!input.displaySubtitle && input.slideRole !== 'OPENER' && input.slideRole !== 'HOOK';
  const subtitleMaxChars = Math.floor(contentWidth / (subtitleSize * 0.48));
  const subtitleLines = hasSubtitle ? wrapText(input.displaySubtitle!, subtitleMaxChars) : [];
  const subtitleGap = hasSubtitle ? 20 : 0;
  const subtitleBlockHeight = hasSubtitle ? subtitleSize + (subtitleLines.length - 1) * subtitleLineHeight : 0;

  // Add CTA height for OPENER slides
  const isOpener = input.slideRole === 'OPENER' || input.slideRole === 'HOOK';
  const ctaFontSize = BOLD_FONT.cta.size;
  const ctaGap = isOpener ? ctaFontSize * 0.8 : 0;
  const ctaHeight = isOpener ? ctaFontSize : 0;
  const totalTextHeight = titleBlockHeight + subtitleGap + subtitleBlockHeight + ctaGap + ctaHeight;

  // Position text in the bottom third, centered vertically in the zone
  const textZoneTop = CANVAS.height * 0.60;
  const textZoneBottom = CANVAS.height - PAD;
  const textZoneHeight = textZoneBottom - textZoneTop;
  let startY = textZoneTop + (textZoneHeight - totalTextHeight) / 2;
  if (startY + totalTextHeight > textZoneBottom) {
    startY = textZoneBottom - totalTextHeight;
  }

  const elements: string[] = [];

  // Attribution caption — small, top-right. Required by CC-BY when we use
  // Wikipedia/Commons imagery. Rendered with a subtle dark pill so it stays
  // legible on any photo.
  if (input.attributionText) {
    const attrText = input.attributionText.length > 70
      ? input.attributionText.slice(0, 67) + '...'
      : input.attributionText;
    const attrFontSize = 20;
    const attrPadX = 12;
    const attrPadY = 6;
    const attrTextWidth = attrText.length * attrFontSize * 0.5;
    const attrBoxWidth = attrTextWidth + attrPadX * 2;
    const attrBoxHeight = attrFontSize + attrPadY * 2;
    const attrBoxX = CANVAS.width - attrBoxWidth - 24;
    const attrBoxY = 24;
    elements.push(
      `<rect x="${attrBoxX}" y="${attrBoxY}" width="${attrBoxWidth}" height="${attrBoxHeight}" rx="10" fill="rgba(0,0,0,0.45)"/>`
      + `<text x="${attrBoxX + attrPadX}" y="${attrBoxY + attrPadY + attrFontSize * 0.82}" `
      + `font-family="'Inter', sans-serif" font-size="${attrFontSize}" font-weight="400" fill="rgba(255,255,255,0.85)">`
      + escapeXml(attrText)
      + `</text>`
    );
  }

  // Title lines — centered horizontally
  titleLines.forEach((line, i) => {
    const y = startY + t1Size + i * lineHeight;
    elements.push(
      `<text x="${CANVAS.width / 2}" y="${Math.round(y)}" `
      + `text-anchor="middle" `
      + `font-family="${displayFontFamily}" `
      + `font-size="${t1Size}" font-weight="${BOLD_FONT.title.weight}" `
      + `fill="${t1Color}" letter-spacing="-1.5">`
      + escapeXml(line)
      + `</text>`
    );
  });

  // Subtitle lines — smaller, lighter, below title
  if (hasSubtitle) {
    const subtitleStartY = startY + titleBlockHeight + subtitleGap;
    subtitleLines.forEach((line, i) => {
      const y = subtitleStartY + subtitleSize + i * subtitleLineHeight;
      elements.push(
        `<text x="${CANVAS.width / 2}" y="${Math.round(y)}" `
        + `text-anchor="middle" `
        + `font-family="'Inter', sans-serif" `
        + `font-size="${subtitleSize}" font-weight="400" `
        + `fill="${t2Color}" opacity="0.9">`
        + escapeXml(line)
        + `</text>`
      );
    });
  }

  // Swipe CTA for OPENER slides (smaller, centered below title with chevron)
  if (isOpener && input.swipeCta) {
    const ctaY = Math.round(startY + titleBlockHeight + ctaGap + ctaFontSize);
    const chevronColor = 'rgba(208,208,208,0.6)';
    // Estimate text width for chevron positioning
    const ctaTextWidth = input.swipeCta.length * ctaFontSize * 0.5;
    const chevronGap = 12;
    const chevronSize = Math.round(ctaFontSize * 0.32);
    const chevronX = CANVAS.width / 2 + ctaTextWidth / 2 + chevronGap;
    const chevronCenterY = ctaY - ctaFontSize * 0.35;

    elements.push(
      `<text x="${CANVAS.width / 2}" y="${ctaY}" `
      + `text-anchor="middle" `
      + `font-family="${displayFontFamily}" `
      + `font-size="${ctaFontSize}" font-weight="${BOLD_FONT.cta.weight}" `
      + `fill="${t2Color}" opacity="0.8">`
      + escapeXml(input.swipeCta)
      + `</text>`
    );
    // Double chevron >> after text
    elements.push(
      `<polyline points="${chevronX},${chevronCenterY - chevronSize} ${chevronX + chevronSize},${chevronCenterY} ${chevronX},${chevronCenterY + chevronSize}" `
      + `fill="none" stroke="${chevronColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
    );
    elements.push(
      `<polyline points="${chevronX + chevronSize + 3},${chevronCenterY - chevronSize} ${chevronX + chevronSize * 2 + 3},${chevronCenterY} ${chevronX + chevronSize + 3},${chevronCenterY + chevronSize}" `
      + `fill="none" stroke="${chevronColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
    );
  }

  // Heavy gradient overlay — stronger than detailed layout
  // Starts transparent at top, becomes fully black by ~55% of the canvas
  const gradient = `
    <defs>
      <linearGradient id="boldGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="30%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="45%" stop-color="#000000" stop-opacity="0.15"/>
        <stop offset="55%" stop-color="#000000" stop-opacity="0.40"/>
        <stop offset="65%" stop-color="#000000" stop-opacity="0.65"/>
        <stop offset="75%" stop-color="#000000" stop-opacity="0.82"/>
        <stop offset="85%" stop-color="#000000" stop-opacity="0.92"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.96"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${CANVAS.width}" height="${CANVAS.height}" fill="url(#boldGrad)"/>`;

  const fontStyleBlock = buildFontStyleBlock(titleFont, titleFont, true);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}">
    <defs>${fontStyleBlock}</defs>
    ${gradient}
    ${elements.join('\n    ')}
  </svg>`;
}

/**
 * Fetch an image URL (typically a Wikimedia Commons file) and fit it to
 * the full slide canvas. Used when the user manually picks a Wikipedia
 * image in ImagePreviewStep — we bypass the image provider so there's
 * no AI re-generation.
 */
async function downloadAndFitToCanvas(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'InstAIgram/1.0' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const arrayBuf = await res.arrayBuffer();
  // Cover-fit to the full canvas: crop center, ensure full bleed regardless of source aspect ratio.
  // `position: 'top'` matches the existing celebrity Wikipedia provider's crop
  // strategy — keeps the subject's head in the upper half of the canvas so it
  // doesn't get covered by the text block in the bottom third. `attention`
  // looked smarter on paper but centered on eyes, which are exactly where the
  // title overlay lands.
  return sharp(Buffer.from(arrayBuf))
    .resize(CANVAS.width, CANVAS.height, { fit: 'cover', position: 'top' })
    .png({ quality: 90 })
    .toBuffer();
}

/**
 * Generate a fallback gradient for when image generation fails.
 */
async function generateBoldFallback(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}">
    <defs>
      <linearGradient id="boldFallback" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stop-color="#1a1a2e"/>
        <stop offset="50%" stop-color="#16213e"/>
        <stop offset="100%" stop-color="#0f3460"/>
      </linearGradient>
    </defs>
    <rect width="${CANVAS.width}" height="${CANVAS.height}" fill="url(#boldFallback)"/>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ─── Main Render Flow ───────────────────────────────────────────

/**
 * Render a single bold-layout slide.
 *
 * Flow:
 *   1. Generate full-bleed image (or use restyle base)
 *   2. Visual presence gate
 *   3. Build SVG overlay (gradient + big centered text)
 *   4. Composite final image
 */
export async function renderBoldSlide(
  input: BoldSlideInput,
  imageProvider?: ImageGenerator,
): Promise<BoldSlideRenderResult> {

  // ── Step 1: Full-Bleed Image ──────────────────────────────────
  let baseImageBuffer: Buffer;
  let imageSource: ImageSourceProvider;
  let imageModel: string | undefined;
  let imageSourceUrl: string | undefined;
  let providerError: string | undefined;
  let providerErrorStatus: number | undefined;

  if (input.baseImage) {
    console.log('[BoldRenderer] Restyle mode — using provided base image');
    baseImageBuffer = input.baseImage;
    imageSource = 'restyle' as ImageSourceProvider;
  } else if (input.forcedImageUrl) {
    // User picked a specific Wikipedia image — skip the provider and fetch it directly.
    console.log(`[BoldRenderer] Forced Wikipedia URL: ${input.forcedImageUrl.slice(0, 80)}...`);
    try {
      baseImageBuffer = await downloadAndFitToCanvas(input.forcedImageUrl);
      imageSource = 'wikipedia' as ImageSourceProvider;
      imageSourceUrl = input.forcedImageUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[BoldRenderer] Forced-URL fetch failed: ${msg}`);
      baseImageBuffer = await generateBoldFallback();
      imageSource = 'fallback';
      providerError = msg;
    }
  } else if (imageProvider) {
    try {
      const slideRole = input.slideRole ?? 'FACT';
      const resolvedModel = imageProvider.resolveModel(slideRole);
      console.log(`[BoldRenderer] Full-bleed generation (model: ${resolvedModel})...`);

      const result = await generateFullBleedImage(
        input.imagePrompt,
        imageProvider,
        { slideRole, subjectName: input.subjectName, excludeUrls: input.excludeUrls },
      );

      baseImageBuffer = result.image;
      imageSource = result.imageSource;
      imageModel = result.meta.model;
      imageSourceUrl = result.meta.sourceUrl;
      providerError = result.providerError;
      providerErrorStatus = result.providerErrorStatus;
      console.log(`[BoldRenderer] Full-bleed image via ${result.imageSource} (${result.meta.durationMs}ms)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isProviderFailed = err instanceof ProviderFailedError;
      console.warn(`[BoldRenderer] ${isProviderFailed ? 'FAILED_PROVIDER' : 'All providers failed'} — ${msg}`);
      baseImageBuffer = await generateBoldFallback();
      imageSource = 'fallback';
    }
  } else {
    console.log('[BoldRenderer] No image provider — using fallback');
    baseImageBuffer = await generateBoldFallback();
    imageSource = 'fallback';
  }

  // ── Step 2: Visual Presence Gate ──────────────────────────────
  if (imageSource === 'fallback') {
    console.warn(`[BoldRenderer] VISUAL_MISSING — fallback gradient used`);

    // Still render a preview with text overlay for the user to see
    let previewImage: Buffer | undefined;
    try {
      const overlaySvg = buildBoldOverlay(input, input.visualStyle);
      previewImage = await sharp(baseImageBuffer)
        .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
        .png({ quality: 90 })
        .toBuffer();
    } catch { /* preview not critical */ }

    return {
      approved: false,
      image: previewImage,
      rawImage: baseImageBuffer,
      imageSource,
      imageModel,
      providerError,
      providerErrorStatus,
      visualMissing: true,
      error: 'VISUAL_MISSING — fallback gradient, not approvable.',
    };
  }

  // ── Step 3: Build SVG overlay (gradient + big text) ───────────
  const overlaySvg = buildBoldOverlay(input, input.visualStyle);

  // ── Step 4: Composite ─────────────────────────────────────────
  let finalImage: Buffer;
  try {
    const style = input.visualStyle ?? DEFAULT_VISUAL_STYLE;
    const compositeInputs: Array<{ input: Buffer; top: number; left: number }> = [
      { input: Buffer.from(overlaySvg), top: 0, left: 0 },
    ];

    if (style.logoBase64) {
      try {
        const logoInput = await buildLogoCompositeInput(style, CANVAS);
        compositeInputs.push(logoInput);
      } catch (logoErr) {
        console.warn(`[BoldRenderer] Logo composite failed: ${logoErr instanceof Error ? logoErr.message : String(logoErr)}`);
      }
    }

    finalImage = await sharp(baseImageBuffer)
      .composite(compositeInputs)
      .png({ quality: 90 })
      .toBuffer();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[BoldRenderer] Composite failed: ${msg}`);
    return {
      approved: false,
      rawImage: baseImageBuffer,
      imageSource,
      imageModel,
      error: `Composite failed: ${msg}`,
    };
  }

  console.log(`[BoldRenderer] Final: ${CANVAS.width}x${CANVAS.height}, ${(finalImage.length / 1024).toFixed(0)}KB`);

  return {
    approved: true,
    image: finalImage,
    rawImage: baseImageBuffer,
    imageSource,
    imageModel,
    imageSourceUrl,
    providerError,
    providerErrorStatus,
    visualMissing: false,
  };
}
