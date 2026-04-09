/**
 * Fact Slide Renderer — Documentary Style
 *
 * Renders carousel slides using the documentary/minimal visual system.
 * Unlike the existing cinematic renderer, this uses:
 *   - Light or natural backgrounds (not dark)
 *   - Dark text on clean surfaces
 *   - No emphasis coloring — single-color text hierarchy
 *   - Minimal, grounded aesthetic
 *
 * Flow:
 *   1. Accept slide input + validated text-fit result
 *   2. Generate base image via Gemini (or fallback)
 *   3. Build SVG text overlay using validated line breaks
 *   4. Composite with sharp
 *   5. Export 1080×1350 PNG
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp');
import type { ImageGenerator, ImageSourceProvider } from '../ai/image-provider';
import { ProviderFailedError } from '../ai/retry';
import { generateLayoutFirstImage } from './layout-compositor';
import {
  analyzeImageZones,
  selectZoneWithConsistency,
  type ZoneAnalysisResult,
  type ZoneId,
} from './zone-analyzer';
import {
  validateTextFit,
  formatValidationReport,
  type TextFitInput,
  type TextZoneVariant,
  type SlideType,
  type ValidationResult,
} from './text-fit-validator';
import { type ChannelVisualStyleContext, DEFAULT_VISUAL_STYLE } from './visual-style';
import { getTitleFont, getBodyFont, buildFontStyleBlock } from './font-pairings';
import { buildLogoCompositeInput } from './logo-compositor';

// ─── Constants ──────────────────────────────────────────────────

const CANVAS = { width: 1080, height: 1350 };

/** Documentary color palette — minimal, grounded */
const DOC_PALETTE = {
  textDark: '#1A1A1A',
  textMedium: '#3D3D3D',
  textLight: '#6B6B6B',
  panelDark: 'rgba(0,0,0,0.12)',
  panelLight: 'rgba(255,255,255,0.12)',
};

/** Font sizes for each tier — matched to OPENER/CTA for design family consistency */
const FONT = {
  t1: { size: 72, weight: 800, lineHeight: 1.15 },
  t2: { size: 40, weight: 500, lineHeight: 1.3 },
  t3: { size: 20, weight: 400, lineHeight: 1.2 },
};

/** Zone positions (fraction of canvas) — expanded for larger typography */
const ZONE_POSITIONS: Record<TextZoneVariant, {
  x: number; y: number; width: number; height: number;
}> = {
  bottom_right: { x: 0.06, y: 0.72, width: 0.88, height: 0.24 },
  left: { x: 0.06, y: 0.74, width: 0.44, height: 0.24 },
  right: { x: 0.50, y: 0.74, width: 0.44, height: 0.24 },
  center_right: { x: 0.06, y: 0.76, width: 0.88, height: 0.22 },
  top_right: { x: 0.50, y: 0.06, width: 0.42, height: 0.35 },
};

// ─── Types ──────────────────────────────────────────────────────

export interface FactSlideInput {
  /** The 5-layer image prompt (CORE SCENE, COMPOSITION, etc.) */
  imagePrompt: string;
  /** Slide type for validation */
  slideType: SlideType;
  /** T1: Headline */
  displayTitle: string;
  /** T2: Support text */
  displaySupport?: string;
  /** T3: Metadata */
  metadata?: string;
  /** Declared text zone variant */
  textZone: TextZoneVariant;
  /** Key phrases that must not break across lines */
  keepTogether?: string[];
  /** Slide role for Gemini model routing */
  slideRole?: string;
  /** Whether to use dark text (default) or light text */
  textMode?: 'dark-on-light' | 'light-on-dark';
  /** Force a specific T1 font size (from carousel-level normalization) */
  forceT1FontSize?: number;
  /** Force a specific text zone (from carousel-level zone consistency) */
  forceZone?: TextZoneVariant;
  /** Subject name passed to image provider (e.g. celebrity's real name for Wikipedia lookup) */
  subjectName?: string;
  /** URLs already used by sibling slides — passed to Wikipedia provider to avoid duplicates */
  excludeUrls?: string[];
  /** Per-channel visual style overrides (font pairing, colors, logo) */
  visualStyle?: ChannelVisualStyleContext;
}

export type RenderStep =
  | 'image_generation'
  | 'image_resize'
  | 'visual_presence'
  | 'zone_analysis'
  | 'readability_gate'
  | 'text_fit_validation'
  | 'overlay_build'
  | 'composite'
  | 'save';

export interface FactSlideRenderResult {
  /** Whether the render was approved */
  approved: boolean;
  /** Validation result */
  validation: ValidationResult;
  /** Formatted validation report (human-readable) */
  report: string;
  /** Final composited image as PNG buffer (only if approved) */
  image?: Buffer;
  /** Raw provider image BEFORE text overlay — used for text-in-image detection */
  rawImage?: Buffer;
  /** Which provider generated the image */
  imageSource?: ImageSourceProvider;
  /** Model used */
  imageModel?: string;
  /** If fallback provider was used, the error from the primary */
  providerError?: string;
  /** HTTP status that triggered fallback */
  providerErrorStatus?: number;
  /** Original source URL (Wikipedia/Wikimedia) — only set when Wikipedia provider was used */
  imageSourceUrl?: string;
  /** File path if saved */
  savedTo?: string;
  /** If an error occurred, which step failed */
  failedStep?: RenderStep;
  /** Error message if a step failed */
  error?: string;
  /**
   * VISUAL_MISSING — slide has no meaningful visual subject.
   * Set when the background is a fallback gradient / flat color / empty texture
   * with no clear subject that expresses the fact.
   * A VISUAL_MISSING slide is BLOCKED from approval.
   */
  visualMissing?: boolean;
  /** Zone analysis result (content-aware placement) */
  zoneAnalysis?: ZoneAnalysisResult;
  /** The zone selected by content-aware analysis */
  selectedZone?: TextZoneVariant;
  /** Actual rendered text layout — final pixel positions after all fallbacks */
  renderedLayout?: RenderedLayout;
}

/**
 * Actual rendered text placement — pixel coordinates of the final text block.
 * This is what the user sees, after all zone fallbacks and font adaptations.
 */
export interface RenderedLayout {
  /** The final zone used for rendering (after all fallbacks) */
  finalZone: TextZoneVariant;
  /** Text block bounding box (pixels) */
  textBlockTop: number;
  textBlockBottom: number;
  textBlockLeft: number;
  textBlockRight: number;
  /** Vertical center of the text block (pixels) */
  verticalCenter: number;
  /** Horizontal center of the text block (pixels) */
  horizontalCenter: number;
  /** Total text block height (pixels) */
  textBlockHeight: number;
  /** Total text block width (pixels, estimated from longest line) */
  textBlockWidth: number;
  /** Vertical center as fraction of canvas height (0–1) */
  verticalCenterNorm: number;
  /** Horizontal center as fraction of canvas width (0–1) */
  horizontalCenterNorm: number;
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
 * Build the SVG text overlay for a documentary-style slide.
 * Also computes and returns the actual rendered layout (pixel positions).
 */
function buildDocumentaryOverlay(
  validation: ValidationResult,
  input: FactSlideInput,
  style: ChannelVisualStyleContext = DEFAULT_VISUAL_STYLE,
): { svg: string; layout: RenderedLayout } {
  const { t1Lines, t2Lines, textZone } = validation;
  const zone = ZONE_POSITIONS[textZone];

  // Resolve colors: channel style overrides take priority over system defaults
  const t1Color = style.headlineColor ?? '#FFFFFF';
  const emphasisColor = style.emphasisColor ?? '#00A8FF';
  const t2Color = style.bodyColor ?? '#D0D0D0';
  void emphasisColor; // available for future emphasis word highlighting

  // Uniform padding from canvas edges
  const TEXT_PAD = 65;

  const zoneY = Math.round(zone.y * CANVAS.height);
  const zoneH = Math.round(zone.height * CANVAS.height);

  // Padded content area — TEXT_PAD from canvas edges on all sides
  const contentLeft = TEXT_PAD;
  const contentRight = CANVAS.width - TEXT_PAD;
  const contentWidth = contentRight - contentLeft;

  // Use resolved font sizes from validation (adaptive sizing), falling back to style then hardcoded defaults
  const t1Size = validation.t1FontSize ?? style?.t1FontSizePx ?? FONT.t1.size;
  const t2Size = validation.t2FontSize ?? style?.t2FontSizePx ?? FONT.t2.size;

  // Hard character-limit wrapping to prevent right-side overflow.
  // Computed dynamically from font size so it scales with adaptive sizing.
  const CHAR_WIDTH_CONSERVATIVE = 0.53; // accounts for wide characters (m, w) in Inter
  function rewrapByCharLimit(lines: string[], maxChars: number): string[] {
    const result: string[] = [];
    for (const line of lines) {
      if (line.length <= maxChars) {
        result.push(line);
      } else {
        const words = line.split(/\s+/);
        let current: string[] = [];
        for (const word of words) {
          const test = [...current, word].join(' ');
          if (test.length > maxChars && current.length > 0) {
            result.push(current.join(' '));
            current = [word];
          } else {
            current.push(word);
          }
        }
        if (current.length > 0) result.push(current.join(' '));
      }
    }
    return result;
  }

  const t1MaxChars = Math.floor(contentWidth / (t1Size * CHAR_WIDTH_CONSERVATIVE));
  const t2MaxChars = Math.floor(contentWidth / (t2Size * CHAR_WIDTH_CONSERVATIVE));
  const wrappedT1Lines = rewrapByCharLimit(t1Lines, t1MaxChars);
  const wrappedT2Lines = rewrapByCharLimit(t2Lines, t2MaxChars);

  // Vertically center the text block in the zone (within padded area)
  const t1BlockHeight = wrappedT1Lines.length > 0
    ? t1Size + (wrappedT1Lines.length - 1) * (t1Size * FONT.t1.lineHeight)
    : 0;
  const gapHeight = wrappedT2Lines.length > 0 ? t2Size * 1.2 : 0;
  const t2BlockHeight = wrappedT2Lines.length > 0
    ? t2Size + (wrappedT2Lines.length - 1) * (t2Size * FONT.t2.lineHeight)
    : 0;
  // Add CTA height for OPENER/HOOK slides so layout accounts for it
  const isOpener = input.slideRole === 'HOOK' || input.slideRole === 'OPENER';
  const ctaFontSizeEst = Math.round(t2Size * 1.25);        // 25% larger than T2
  const ctaGapHeight = isOpener ? ctaFontSizeEst * 0.9 : 0; // gap between title and CTA (+50%)
  const ctaLineHeight = isOpener ? ctaFontSizeEst : 0;      // CTA text height
  const totalTextHeight = t1BlockHeight + gapHeight + t2BlockHeight + ctaGapHeight + ctaLineHeight;
  // Center within padded zone, clamped so text stays TEXT_PAD from canvas bottom
  let startY = zoneY + TEXT_PAD + ((zoneH - 2 * TEXT_PAD) - totalTextHeight) / 2;
  if (startY + totalTextHeight > CANVAS.height - TEXT_PAD) {
    startY = CANVAS.height - TEXT_PAD - totalTextHeight;
  }

  // Compute rendered layout — actual pixel positions
  const longestLine = Math.max(
    ...wrappedT1Lines.map(l => l.length),
    ...wrappedT2Lines.map(l => l.length),
    1,
  );
  const charWidth = t1Size * 0.50; // approximate
  const textBlockWidth = Math.min(longestLine * charWidth, contentWidth);

  const layout: RenderedLayout = {
    finalZone: textZone,
    textBlockTop: Math.round(startY),
    textBlockBottom: Math.round(startY + totalTextHeight),
    textBlockLeft: contentLeft,
    textBlockRight: Math.round(contentLeft + textBlockWidth),
    verticalCenter: Math.round(startY + totalTextHeight / 2),
    horizontalCenter: Math.round(contentLeft + textBlockWidth / 2),
    textBlockHeight: Math.round(totalTextHeight),
    textBlockWidth: Math.round(textBlockWidth),
    verticalCenterNorm: (startY + totalTextHeight / 2) / CANVAS.height,
    horizontalCenterNorm: (contentLeft + textBlockWidth / 2) / CANVAS.width,
  };

  // Resolve fonts
  const titleFont = getTitleFont(style.titleFontId);
  const bodyFont = getBodyFont(style.bodyFontId);
  const displayFontFamily = `'${titleFont.family}', sans-serif`;
  const bodyFontFamily = style.singleFont
    ? `'${titleFont.family}', sans-serif`
    : `'${bodyFont.family}', ${bodyFont.generic ?? 'serif'}`;

  const elements: string[] = [];

  // Text background band (optional, rendered before text)
  if (style.textBgEnabled && style.textBgColor) {
    const bgPad = 16;
    const bgX = contentLeft - bgPad;
    const bgY = Math.round(startY - bgPad);
    const bgW = contentWidth + bgPad * 2;
    const bgH = Math.round(totalTextHeight + bgPad * 2);
    elements.push(
      `<rect x="${bgX}" y="${bgY}" width="${bgW}" height="${bgH}" `
      + `fill="${style.textBgColor}" rx="8"/>`
    );
  }

  // T1 lines
  wrappedT1Lines.forEach((line, i) => {
    const y = startY + t1Size + i * (t1Size * FONT.t1.lineHeight);
    elements.push(
      `<text x="${contentLeft}" y="${Math.round(y)}" `
      + `font-family="${displayFontFamily}" `
      + `font-size="${t1Size}" font-weight="${titleFont.weight}" `
      + `fill="${t1Color}" letter-spacing="-1.5">`
      + escapeXml(line)
      + `</text>`
    );
  });

  // T2 lines
  const t2StartY = startY + t1BlockHeight + gapHeight;
  wrappedT2Lines.forEach((line, i) => {
    const y = t2StartY + t2Size + i * (t2Size * FONT.t2.lineHeight);
    elements.push(
      `<text x="${contentLeft}" y="${Math.round(y)}" `
      + `font-family="${bodyFontFamily}" `
      + `font-size="${t2Size}" font-weight="${style.singleFont ? titleFont.singleBodyWeight : bodyFont.weight}" `
      + `fill="${t2Color}">`
      + escapeXml(line)
      + `</text>`
    );
  });

  // T3 metadata (bottom of padded zone, small)
  if (input.metadata) {
    const t3Color = '#888888';
    const t3Y = zoneY + zoneH - TEXT_PAD;
    elements.push(
      `<text x="${contentLeft}" y="${Math.round(t3Y)}" `
      + `font-family="'Inter', 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" `
      + `font-size="${FONT.t3.size}" font-weight="${FONT.t3.weight}" `
      + `fill="${t3Color}" opacity="0.7">`
      + escapeXml(input.metadata)
      + `</text>`
    );
  }

  // "Swipe to discover →" CTA for OPENER/HOOK slides
  // Uses T2 typography (body font, same size/weight) for design consistency
  // Arrow is a text character (→) — clean, scales with font, no SVG drawing artifacts
  if (isOpener) {
    const ctaFontSize = Math.round(t2Size * 1.25); // T2 size + 25%
    const ctaColor = t2Color;   // match T2 color
    const ctaX = TEXT_PAD;
    // Position after the T1/T2 block + gap
    const textBlockEnd = startY + t1BlockHeight + gapHeight + t2BlockHeight;
    const ctaY = Math.round(textBlockEnd + ctaGapHeight + ctaFontSize);

    elements.push(
      `<text x="${ctaX}" y="${ctaY}" `
      + `font-family="${bodyFontFamily}" `
      + `font-size="${ctaFontSize}" font-weight="${FONT.t2.weight}" `
      + `fill="${ctaColor}">Swipe to discover &#x2192;</text>`
    );
  }

  // Full-canvas gradient overlay — 100% transparent at top, 100% opaque black at bottom.
  // Covers the entire canvas so there is no hard edge anywhere.
  // The curve is shaped so the top half stays mostly transparent and
  // opacity ramps steeply in the lower image region, reaching full black
  // BY the image/bar boundary (~76%) to eliminate any visible seam.
  const textPanelOverlay = `
    <defs>
      <linearGradient id="textBarGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="40%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="48%" stop-color="#000000" stop-opacity="0.05"/>
        <stop offset="55%" stop-color="#000000" stop-opacity="0.15"/>
        <stop offset="60%" stop-color="#000000" stop-opacity="0.30"/>
        <stop offset="65%" stop-color="#000000" stop-opacity="0.50"/>
        <stop offset="70%" stop-color="#000000" stop-opacity="0.75"/>
        <stop offset="74%" stop-color="#000000" stop-opacity="0.92"/>
        <stop offset="76%" stop-color="#000000" stop-opacity="1.0"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="1.0"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${CANVAS.width}" height="${CANVAS.height}" fill="url(#textBarGrad)"/>`;

  const fontStyleBlock = buildFontStyleBlock(titleFont, bodyFont, style.singleFont);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}">
    <defs>${fontStyleBlock}</defs>
    ${textPanelOverlay}
    ${elements.join('\n    ')}
  </svg>`;

  return { svg, layout };
}

/**
 * Generate a natural-tone fallback background when Gemini is unavailable.
 * Uses a warm, muted gradient instead of the cinematic dark theme.
 */
async function generateDocumentaryFallback(width: number, height: number): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="docBg" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stop-color="#E8E4DF"/>
        <stop offset="100%" stop-color="#D4CFC8"/>
      </linearGradient>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
        <feBlend in="SourceGraphic" mode="multiply"/>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#docBg)"/>
    <rect width="${width}" height="${height}" filter="url(#grain)" opacity="0.04"/>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ─── Main Render Flow ───────────────────────────────────────────

/**
 * Validate and render a single fact slide.
 *
 * Flow (content-aware):
 *   1. Generate base image via Gemini (or fallback)
 *   2. Visual presence gate — block if no real subject
 *   3. Zone analysis — analyze image to find best text placement
 *   4. Text-fit validation — validate text at the selected zone
 *   5. SVG text overlay
 *   6. Composite final image
 */
export async function renderFactSlide(
  input: FactSlideInput,
  imageProvider?: ImageGenerator,
): Promise<FactSlideRenderResult> {
  const emptyValidation: ValidationResult = {
    approved: false, checks: [], failures: [], t1Lines: [], t2Lines: [],
    totalLines: 0, zoneOccupancy: 0, textZone: input.textZone, t1FontSize: 0, t2FontSize: 0,
  };

  // ── Step 1: Layout-First Image Composition ──────────────────────
  //
  // Instead of generating a full scene and hoping for clean space,
  // we generate the subject separately and composite it onto a
  // controlled background with a guaranteed clean text zone.
  //
  let currentStep: RenderStep = 'image_generation';
  let baseImageBuffer: Buffer;
  let imageSource: ImageSourceProvider;
  let imageModel: string | undefined;
  let imageSourceUrl: string | undefined;
  let providerError: string | undefined;
  let providerErrorStatus: number | undefined;

  if (imageProvider) {
    try {
      const slideRole = input.slideRole ?? 'FACT';
      const resolvedModel = imageProvider.resolveModel(slideRole);
      console.log(`[FactRenderer] Layout-first composition (primary model: ${resolvedModel})...`);

      const result = await generateLayoutFirstImage(
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
      console.log(`[FactRenderer] Layout-first image composed via ${result.imageSource} (${result.meta.durationMs}ms)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isProviderFailed = err instanceof ProviderFailedError;
      const label = isProviderFailed ? 'FAILED_PROVIDER' : 'All providers failed';
      console.warn(`[FactRenderer] ${label} at step: ${currentStep} — ${msg}`);
      console.warn(`[FactRenderer] Falling back to documentary gradient`);
      baseImageBuffer = await generateDocumentaryFallback(CANVAS.width, CANVAS.height);
      imageSource = 'fallback';
    }
  } else {
    console.log('[FactRenderer] No image provider — using documentary fallback');
    baseImageBuffer = await generateDocumentaryFallback(CANVAS.width, CANVAS.height);
    imageSource = 'fallback';
  }

  // ── Step 2: Visual Presence Gate ────────────────────────────────
  currentStep = 'visual_presence';
  if (imageSource === 'fallback') {
    console.warn(`[FactRenderer] VISUAL_MISSING — no meaningful visual subject (source: fallback)`);

    let previewImage: Buffer | undefined;
    try {
      const preValidation = validateTextFit({
        slideType: input.slideType, displayTitle: input.displayTitle,
        displaySupport: input.displaySupport, textZone: input.textZone,
        keepTogether: input.keepTogether, forceT1FontSize: input.forceT1FontSize,
        baseT1FontSize: input.visualStyle?.t1FontSizePx,
        baseT2FontSize: input.visualStyle?.t2FontSizePx,
      });
      const { svg: previewSvg } = buildDocumentaryOverlay(preValidation, input, input.visualStyle);
      previewImage = await sharp(baseImageBuffer)
        .composite([{ input: Buffer.from(previewSvg), top: 0, left: 0 }])
        .png({ quality: 90 })
        .toBuffer();
    } catch { /* preview not critical */ }

    return {
      approved: false, validation: emptyValidation, report: 'VISUAL_MISSING',
      image: previewImage, rawImage: baseImageBuffer, imageSource, imageModel,
      providerError, providerErrorStatus,
      failedStep: 'visual_presence',
      error: 'VISUAL_MISSING — no meaningful visual subject. Fallback gradient is not approvable.',
      visualMissing: true,
    };
  }

  // ── Step 3: Content-Aware Zone Analysis ─────────────────────────
  currentStep = 'zone_analysis';
  let zoneAnalysis: ZoneAnalysisResult | undefined;
  let selectedZone: TextZoneVariant = input.forceZone ?? input.textZone;

  try {
    zoneAnalysis = await analyzeImageZones(
      baseImageBuffer,
      input.textZone as ZoneId,
    );

    // Select zone: use forced zone if provided, otherwise use analysis
    if (input.forceZone) {
      const selection = selectZoneWithConsistency(zoneAnalysis, input.forceZone as ZoneId);
      selectedZone = selection.zone as TextZoneVariant;
      console.log(`[FactRenderer] Zone (forced): ${selectedZone} — ${selection.reason}`);
    } else {
      selectedZone = zoneAnalysis.bestZone.zone as TextZoneVariant;
      console.log(`[FactRenderer] Zone (content-aware): ${selectedZone} (score: ${zoneAnalysis.bestZone.score})`);
    }

    // Log all zone scores with full metrics
    for (const z of zoneAnalysis.zones) {
      const marker = z.zone === selectedZone ? '→' : ' ';
      const status = z.rejected ? `REJECTED: ${z.rejectionReason}` : `score: ${z.score}`;
      console.log(`  ${marker} ${z.zone.padEnd(14)} var: ${z.variance.toFixed(1)}, ent: ${z.entropy.toFixed(1)}, sat: ${z.saturation.toFixed(0)}, range: ${z.dynamicRange.toFixed(0)}, ${status}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[FactRenderer] Zone analysis failed: ${msg} — using declared zone "${input.textZone}"`);
    selectedZone = input.textZone;
  }

  // ── Step 3b: Hard Text Zone Readability Gate ────────────────────
  //
  // Block the slide if the SELECTED text zone is not actually usable.
  // This catches images where the provider ignored composition instructions
  // and filled the text zone with subject/clutter/baked-in text.
  //
  // Gate checks (using actual generated image, not prompt intent):
  //   1. Selected zone is hard-rejected (subject overlap OR poor contrast)
  //   2. No alternative zone is usable (all zones rejected)
  //
  // If the gate fires → BLOCKED_PROVIDER_LAYOUT (slide not approved)
  //
  currentStep = 'readability_gate';
  if (zoneAnalysis) {
    const selectedZoneResult = zoneAnalysis.zones.find(z => z.zone === selectedZone);
    const anyUsableZone = zoneAnalysis.zones.find(z => !z.rejected && z.score >= 40);

    if (selectedZoneResult?.rejected && !anyUsableZone) {
      // ALL zones are rejected — image layout is fundamentally unusable
      const reason = selectedZoneResult.rejectionReason ?? 'all zones rejected';
      console.error(`[FactRenderer] BLOCKED_PROVIDER_LAYOUT — no usable text zone in generated image`);
      console.error(`[FactRenderer] Selected zone "${selectedZone}": ${reason}`);
      console.error(`[FactRenderer] All ${zoneAnalysis.zones.length} zones rejected — provider ignored composition directives`);

      // Build preview for debugging
      let previewImage: Buffer | undefined;
      try {
        const preValidation = validateTextFit({
          slideType: input.slideType, displayTitle: input.displayTitle,
          displaySupport: input.displaySupport, textZone: selectedZone,
          keepTogether: input.keepTogether, forceT1FontSize: input.forceT1FontSize,
        });
        const { svg: previewSvg } = buildDocumentaryOverlay(preValidation, input, input.visualStyle);
        previewImage = await sharp(baseImageBuffer)
          .composite([{ input: Buffer.from(previewSvg), top: 0, left: 0 }])
          .png({ quality: 90 })
          .toBuffer();
      } catch { /* preview not critical */ }

      return {
        approved: false, validation: emptyValidation,
        report: `BLOCKED_PROVIDER_LAYOUT — ${reason}`,
        image: previewImage, rawImage: baseImageBuffer, imageSource, imageModel,
        providerError, providerErrorStatus,
        failedStep: 'readability_gate',
        error: `BLOCKED_PROVIDER_LAYOUT — no usable text zone. Selected "${selectedZone}": ${reason}. All zones rejected.`,
        visualMissing: false,
        zoneAnalysis,
        selectedZone,
      };
    }

    // If selected zone is rejected but an alternative exists, use the alternative
    if (selectedZoneResult?.rejected && anyUsableZone) {
      console.warn(`[FactRenderer] Readability gate: selected zone "${selectedZone}" rejected — switching to "${anyUsableZone.zone}" (score: ${anyUsableZone.score})`);
      selectedZone = anyUsableZone.zone as TextZoneVariant;
    }
  }

  // ── Step 4: Validate text fit (at the selected zone) ───────────
  currentStep = 'text_fit_validation';
  let validation: ValidationResult;
  let report: string;
  try {
    const validationInput: TextFitInput = {
      slideType: input.slideType,
      displayTitle: input.displayTitle,
      displaySupport: input.displaySupport,
      metadata: input.metadata,
      textZone: selectedZone,
      keepTogether: input.keepTogether,
      forceT1FontSize: input.forceT1FontSize,
      baseT1FontSize: input.visualStyle?.t1FontSizePx,
      baseT2FontSize: input.visualStyle?.t2FontSizePx,
    };

    validation = validateTextFit(validationInput);
    report = formatValidationReport(validation);
    console.log(report);

    if (!validation.approved) {
      console.warn(`[FactRenderer] Text-fit validation FAILED (${validation.failures.join(', ')}) — continuing render with best-effort overlay`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[FactRenderer] FAILED at step: ${currentStep} — ${msg}`);
    return {
      approved: false, validation: emptyValidation,
      report: `FAILED at ${currentStep}: ${msg}`,
      failedStep: currentStep, error: msg,
      image: undefined, imageSource, imageModel,
      providerError, providerErrorStatus,
    };
  }

  // ── Step 5: Build SVG text overlay ─────────────────────────────
  currentStep = 'overlay_build';
  let overlaySvgStr: string;
  let renderedLayout: RenderedLayout | undefined;
  try {
    const { svg, layout } = buildDocumentaryOverlay(validation, input, input.visualStyle);
    overlaySvgStr = svg;
    renderedLayout = layout;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[FactRenderer] FAILED at step: ${currentStep} — ${msg}`);
    return {
      approved: false, validation, report, failedStep: currentStep, error: msg,
      imageSource, imageModel, providerError, providerErrorStatus,
    };
  }

  // ── Step 6: Composite ──────────────────────────────────────────
  currentStep = 'composite';
  let finalImage: Buffer;
  try {
    console.log(`[FactRenderer] Compositing text overlay onto ${(baseImageBuffer.length / 1024).toFixed(0)}KB base image...`);
    const style = input.visualStyle ?? DEFAULT_VISUAL_STYLE;
    const compositeInputs: Array<{ input: Buffer; top: number; left: number }> = [
      { input: Buffer.from(overlaySvgStr), top: 0, left: 0 },
    ];
    if (style.logoBase64) {
      try {
        const logoInput = await buildLogoCompositeInput(style, CANVAS);
        compositeInputs.push(logoInput);
      } catch (logoErr) {
        console.warn(`[FactRenderer] Logo composite failed: ${logoErr instanceof Error ? logoErr.message : String(logoErr)}`);
      }
    }
    finalImage = await sharp(baseImageBuffer)
      .composite(compositeInputs)
      .png({ quality: 90 })
      .toBuffer();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[FactRenderer] FAILED at step: ${currentStep} — ${msg}`);
    return {
      approved: false, validation, report, failedStep: currentStep, error: msg,
      imageSource, imageModel, providerError, providerErrorStatus,
    };
  }

  console.log(`[FactRenderer] Final: ${CANVAS.width}x${CANVAS.height}, ${(finalImage.length / 1024).toFixed(0)}KB`);
  if (renderedLayout) {
    console.log(`[FactRenderer] Layout: zone=${renderedLayout.finalZone}, vCenter=${renderedLayout.verticalCenterNorm.toFixed(2)}, hCenter=${renderedLayout.horizontalCenterNorm.toFixed(2)}`);
  }

  return {
    approved: validation.approved,
    validation,
    report,
    image: finalImage,
    rawImage: baseImageBuffer,
    imageSource,
    imageModel,
    imageSourceUrl,
    providerError,
    providerErrorStatus,
    visualMissing: false,
    zoneAnalysis,
    selectedZone,
    renderedLayout,
  };
}

/**
 * Render and save a fact slide to disk.
 */
export async function renderAndSaveFactSlide(
  input: FactSlideInput,
  outputPath: string,
  imageProvider?: ImageGenerator,
): Promise<FactSlideRenderResult> {
  const result = await renderFactSlide(input, imageProvider);

  if (result.approved && result.image) {
    const fs = await import('fs/promises');
    const path = await import('path');

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, result.image);
    console.log(`[FactRenderer] Saved to: ${outputPath}`);

    return { ...result, savedTo: outputPath };
  }

  return result;
}
