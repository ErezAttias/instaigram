/**
 * OPENER Slide Renderer
 *
 * End-to-end rendering path for a single OPENER (HOOK) slide:
 * 1. Uses the visual system to build an image prompt + layout
 * 2. Generates the base image via Gemini (or uses a fallback gradient)
 * 3. Composites text overlay using sharp + SVG
 * 4. Exports a final 1080x1350 PNG
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp');
import { buildSlidePrompt, type PromptBuilderOutput, type LayoutInstruction } from './prompt-builder';
import { TYPOGRAPHY, EMPHASIS_RULES, LINE_BREAK_RULES, TEXT_COLOR_RULES } from './text-overlay';
import { COLOR_PALETTE, IMAGE_CONSTRAINTS } from './system';
import type { ImageGenerator, ImageSourceProvider } from '../ai/image-provider';
import { ProviderFailedError } from '../ai/retry';
import { analyzeImageZones, type ZoneAnalysisResult } from './zone-analyzer';
import { generateLayoutFirstImage, CANVAS, IMAGE_REGION, TEXT_BAR } from './layout-compositor';
import { type ChannelVisualStyleContext, DEFAULT_VISUAL_STYLE } from './visual-style';
import { getFontPairing, buildFontStyleBlock } from './font-pairings';
import { buildLogoCompositeInput } from './logo-compositor';

// ─── Input / Output Types ────────────────────────────────────────

export interface OpenerSlideInput {
  /** Slide role — should be 'HOOK' for OPENER */
  slideRole: string;
  /** The main title displayed on the slide */
  displayTitle: string;
  /** Supporting text beneath the title */
  displaySupport: string;
  /** Subject description for image generation */
  subject: string;
  /** Optional: force a specific visual template */
  templateOverride?: string;
  /** Per-channel visual style overrides (font pairing, colors, logo) */
  visualStyle?: ChannelVisualStyleContext;
}

export interface RenderResult {
  /** Whether the render was approved (false if VISUAL_MISSING) */
  approved: boolean;
  /** Final composited image as PNG buffer */
  image: Buffer;
  /** The prompt builder output used */
  promptOutput: PromptBuilderOutput;
  /** Which provider generated the image */
  imageSource: ImageSourceProvider;
  /** Model used (if applicable) */
  imageModel?: string;
  /** If fallback provider was used, the error from the primary */
  providerError?: string;
  /** HTTP status that triggered fallback */
  providerErrorStatus?: number;
  /** File path if saved to disk */
  savedTo?: string;
  /**
   * VISUAL_MISSING — slide has no meaningful visual subject.
   * Set when the background is a fallback gradient with no real subject.
   */
  visualMissing?: boolean;
  /** Raw provider image BEFORE text overlay — used for text-in-image detection */
  rawImage?: Buffer;
}

// ─── Swipe CTA for Opener Slides ────────────────────────────────

/**
 * Build SVG elements for a "Swipe to learn why" CTA with a long arrow.
 * Used on OPENER/HOOK slides to indicate the carousel is swipeable.
 *
 * Layout: "Swipe to learn why" text ── long line ──▶
 */
function buildSwipeCtaSvg(
  x: number,
  y: number,
  maxWidth: number,
): string {
  const ctaText = 'Swipe to learn why';
  const fontSize = 36; // match T2 font size
  const textColor = '#B0B0B0'; // match T2 color
  const lineColor = 'rgba(176,176,176,0.5)';

  // Estimate text width (~0.45em per char for Roboto Slab at regular weight)
  const textWidth = ctaText.length * fontSize * 0.45;
  const gap = 20;
  const arrowHeadSize = 10;

  // Line starts after text + gap, ends at maxWidth
  const lineStartX = x + textWidth + gap;
  const lineEndX = x + maxWidth - arrowHeadSize - 4;
  const lineY = y - fontSize * 0.35; // vertically center line with text

  return `
    <text x="${x}" y="${y}"
      font-family="'Roboto Slab', serif"
      font-size="${fontSize}" font-weight="400"
      fill="${textColor}">${escapeXml(ctaText)}</text>
    <line x1="${lineStartX}" y1="${lineY}" x2="${lineEndX}" y2="${lineY}"
      stroke="${lineColor}" stroke-width="1.5" stroke-linecap="round"/>
    <polygon points="${lineEndX},${lineY - arrowHeadSize / 2} ${lineEndX + arrowHeadSize},${lineY} ${lineEndX},${lineY + arrowHeadSize / 2}"
      fill="${lineColor}"/>`;
}

// ─── SVG Text Rendering ─────────────────────────────────────────

/**
 * Escape special XML characters for safe SVG embedding.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build SVG text spans for a headline with emphasis words highlighted.
 * Returns an array of tspan-compatible segments.
 */
function buildEmphasisSpans(
  text: string,
  baseColor: string,
  emphasisColor: string,
  fontSize: number,
  fontWeight: number
): string {
  const { segments } = EMPHASIS_RULES.findEmphasisWords(text);
  return segments
    .map(seg => {
      const fill = seg.isEmphasis ? emphasisColor : baseColor;
      const weight = seg.isEmphasis ? 900 : fontWeight;
      return `<tspan fill="${fill}" font-weight="${weight}">${escapeXml(seg.text)}</tspan>`;
    })
    .join(' ');
}

/**
 * Build SVG for a single text zone (headline, body, or CTA).
 */
function buildTextZoneSvg(
  instruction: LayoutInstruction,
  canvasWidth: number,
  canvasHeight: number,
  slideRole: string,
  style: ChannelVisualStyleContext = DEFAULT_VISUAL_STYLE,
): string {
  const typoKey = instruction.typography;
  const typo = TYPOGRAPHY[typoKey] ?? TYPOGRAPHY.body;
  const colors = TEXT_COLOR_RULES.getColorsForRole(slideRole);

  const x = Math.round(instruction.position.x * canvasWidth);
  const y = Math.round(instruction.position.y * canvasHeight);
  const zoneWidth = Math.round(instruction.position.width * canvasWidth);

  // Resolve anchor from alignment
  const anchor = instruction.alignment === 'center' ? 'middle'
    : instruction.alignment === 'right' ? 'end'
    : 'start';

  // Text X position based on alignment
  const textX = instruction.alignment === 'center' ? x + zoneWidth / 2
    : instruction.alignment === 'right' ? x + zoneWidth
    : x;

  const fontSize = typo.fontSize;
  const lineHeight = Math.round(fontSize * typo.lineHeight);
  const letterSpacing = typo.letterSpacing;
  const fontWeight = typo.fontWeight;
  const transform = typo.textTransform;

  // Skip placeholder content
  const content = instruction.content;
  if (content.startsWith('[') && content.endsWith(']')) return '';

  // Break content into lines
  const lines = instruction.lines ?? LINE_BREAK_RULES.breakIntoLines(content);

  // Safe margin to prevent text from rendering outside canvas bounds
  const SAFE_MARGIN = 40;

  // Build SVG text element with tspans per line
  const tspans = lines.map((line, i) => {
    const yOffset = y + fontSize + (i * lineHeight);

    // Estimate text width for bounds clamping (~0.55 of fontSize per char for sans-serif)
    const charWidthFactor = 0.55;
    const effectiveLetterSpacing = letterSpacing ?? 0;
    const estimatedLineWidth = line.length * (fontSize * charWidthFactor + effectiveLetterSpacing);

    // Compute the actual left/right edges of the text given the anchor
    let lineTextX = textX;
    let leftEdge: number;
    let rightEdge: number;

    if (anchor === 'end') {
      leftEdge = lineTextX - estimatedLineWidth;
      rightEdge = lineTextX;
    } else if (anchor === 'middle') {
      leftEdge = lineTextX - estimatedLineWidth / 2;
      rightEdge = lineTextX + estimatedLineWidth / 2;
    } else {
      leftEdge = lineTextX;
      rightEdge = lineTextX + estimatedLineWidth;
    }

    // Clamp: shift text so it stays within [SAFE_MARGIN, canvasWidth - SAFE_MARGIN]
    // Step 1: fix right overflow first
    if (rightEdge > canvasWidth - SAFE_MARGIN) {
      const shift = rightEdge - (canvasWidth - SAFE_MARGIN);
      lineTextX -= shift;
      leftEdge -= shift;
      rightEdge -= shift;
    }
    // Step 2: fix left overflow (takes priority — start of text must be visible)
    if (leftEdge < SAFE_MARGIN) {
      const shift = SAFE_MARGIN - leftEdge;
      lineTextX += shift;
      leftEdge += shift;
      rightEdge += shift;
    }

    console.log(`[Layout] Headline bounds vs canvas bounds: line="${line.slice(0, 30)}..." left=${Math.round(leftEdge)} right=${Math.round(rightEdge)} canvas=0-${canvasWidth} textX=${Math.round(textX)}→${Math.round(lineTextX)}`);

    const pairing = getFontPairing(style.fontPairingId);
    const displayFontFamily = `'${pairing.display.family}', sans-serif`;
    const bodyFontFamily = style.monoFont
      ? `'${pairing.display.family}', sans-serif`
      : `'${pairing.body.family}', serif`;

    if (instruction.zone === 'headline') {
      // Apply emphasis coloring to headline
      const emphasisColor = style.emphasisColor ?? colors.emphasis ?? COLOR_PALETTE.accentPrimary;
      const baseColor = style.headlineColor ?? instruction.color;
      const spans = buildEmphasisSpans(line, baseColor, emphasisColor, fontSize, pairing.display.weight);
      return `<text x="${lineTextX}" y="${yOffset}" text-anchor="${anchor}" font-size="${fontSize}" font-weight="${pairing.display.weight}" letter-spacing="${letterSpacing}" font-family="${displayFontFamily}" ${transform === 'uppercase' ? 'text-transform="uppercase"' : ''}>${spans}</text>`;
    }

    const fill = style.bodyColor ?? instruction.color;
    const displayLine = transform === 'uppercase' ? line.toUpperCase() : line;
    return `<text x="${lineTextX}" y="${yOffset}" text-anchor="${anchor}" font-size="${fontSize}" font-weight="${fontWeight}" letter-spacing="${letterSpacing}" font-family="${bodyFontFamily}" fill="${fill}">${escapeXml(displayLine)}</text>`;
  });

  return tspans.join('\n    ');
}

/**
 * Build the complete SVG overlay for all text zones.
 */
function buildOverlaySvg(
  promptOutput: PromptBuilderOutput,
  canvasWidth: number,
  canvasHeight: number,
  style: ChannelVisualStyleContext = DEFAULT_VISUAL_STYLE,
): string {
  const { layout, meta } = promptOutput;

  // Build strong dark gradient overlays — top and bottom — for crisp text readability
  // Strengthened: near-black at edges to guarantee white text is always readable
  const pairing = getFontPairing(style.fontPairingId);
  const fontStyleBlock = buildFontStyleBlock(pairing, style.monoFont);
  const gradientOverlay = `
    <defs>
      ${fontStyleBlock}
      <linearGradient id="textProtectTop" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.92"/>
        <stop offset="30%" stop-color="#000000" stop-opacity="0.6"/>
        <stop offset="55%" stop-color="#000000" stop-opacity="0.0"/>
      </linearGradient>
      <linearGradient id="textProtectBottom" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.0"/>
        <stop offset="45%" stop-color="#000000" stop-opacity="0.3"/>
        <stop offset="70%" stop-color="#000000" stop-opacity="0.7"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.95"/>
      </linearGradient>
    </defs>
    <rect width="${canvasWidth}" height="${canvasHeight}" fill="url(#textProtectTop)"/>
    <rect width="${canvasWidth}" height="${canvasHeight}" fill="url(#textProtectBottom)"/>`;

  // Render each text zone
  const textElements = layout
    .map(instruction => buildTextZoneSvg(instruction, canvasWidth, canvasHeight, meta.slideRole, style))
    .filter(Boolean)
    .join('\n    ');

  // Add "Swipe to learn why →" CTA for OPENER/HOOK slides
  let swipeCtaSvg = '';
  if (meta.slideRole === 'HOOK' || meta.slideRole === 'OPENER') {
    // Position CTA near the bottom, below the last text zone
    const ctaPad = 40;
    const ctaY = canvasHeight - 60;
    const ctaMaxWidth = canvasWidth - 2 * ctaPad;
    swipeCtaSvg = buildSwipeCtaSvg(ctaPad, ctaY, ctaMaxWidth);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
    ${gradientOverlay}
    ${textElements}
    ${swipeCtaSvg}
  </svg>`;
}

// ─── Fallback Background Generator ──────────────────────────────

/**
 * Generate a dark gradient background when DALL-E is unavailable.
 * Produces a cinematic-feeling dark image with subtle radial glow.
 */
async function generateFallbackBackground(
  width: number,
  height: number
): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <radialGradient id="glow" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stop-color="${COLOR_PALETTE.bgTertiary}" stop-opacity="0.6"/>
        <stop offset="50%" stop-color="${COLOR_PALETTE.bgSecondary}" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="${COLOR_PALETTE.bgPrimary}" stop-opacity="1"/>
      </radialGradient>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
        <feBlend in="SourceGraphic" mode="multiply"/>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="${COLOR_PALETTE.bgPrimary}"/>
    <rect width="${width}" height="${height}" fill="url(#glow)"/>
    <rect width="${width}" height="${height}" filter="url(#grain)" opacity="0.03"/>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ─── Main Renderer ──────────────────────────────────────────────

/**
 * Render a single OPENER (HOOK) slide end-to-end.
 *
 * Flow:
 * 1. buildSlidePrompt() → template + image prompt + layout
 * 2. Gemini generateImage() → base image (or fallback gradient)
 * 3. buildOverlaySvg() → SVG text overlay
 * 4. sharp composite → final 1080x1350 PNG
 */
export async function renderOpenerSlide(
  input: OpenerSlideInput,
  imageProvider?: ImageGenerator
): Promise<RenderResult> {
  const { width, height } = IMAGE_CONSTRAINTS.dimensions;

  // ── Step 1: Build prompt + layout ──
  const promptOutput = buildSlidePrompt({
    slideRole: input.slideRole,
    subject: input.subject,
    headlineText: input.displayTitle,
    bodyText: input.displaySupport,
    templateOverride: input.templateOverride,
  });

  console.log(`[Renderer] Template selected: ${promptOutput.template.name}`);
  console.log(`[Renderer] Lighting: ${promptOutput.meta.selectedLighting}`);
  console.log(`[Renderer] Background: ${promptOutput.meta.selectedBackground}`);

  // ── Informational topics: use layout-first rendering ──
  //
  // Same approach as FACT slides: image on top (1080×1030),
  // text bar on bottom (1080×320). No gradient overlays needed.
  // This eliminates the darkness and text cropping issues.
  const isInformational = promptOutput.template.id === 'informational-direct';
  const visualStyle = input.visualStyle ?? DEFAULT_VISUAL_STYLE;

  if (isInformational && imageProvider) {
    return renderOpenerLayoutFirst(input, promptOutput, imageProvider, visualStyle);
  }

  // ── Legacy path: full-frame image with gradient overlay ──
  let baseImageBuffer: Buffer;
  let imageSource: ImageSourceProvider;
  let imageModel: string | undefined;
  let providerError: string | undefined;
  let providerErrorStatus: number | undefined;

  if (imageProvider) {
    try {
      const resolvedModel = imageProvider.resolveModel(input.slideRole);
      console.log(`[Renderer] Generating image via unified provider (primary model: ${resolvedModel})...`);
      console.log(`[Renderer] Prompt: ${promptOutput.imagePrompt.slice(0, 150)}...`);

      const result = await imageProvider.generateImage(promptOutput.imagePrompt, {
        width,
        height,
        slideRole: input.slideRole,
      });

      // Provider returns variable sizes — resize to exact 1080x1350
      baseImageBuffer = await sharp(result.data)
        .resize(width, height, { fit: 'cover', position: 'centre' })
        .png()
        .toBuffer();

      imageSource = result.imageSource;
      imageModel = result.meta.model;
      providerError = result.providerError;
      providerErrorStatus = result.providerErrorStatus;
      console.log(`[Renderer] Image generated via ${result.imageSource} (${result.meta.durationMs}ms, model: ${result.meta.model})`);
    } catch (err) {
      const isProviderFailed = err instanceof ProviderFailedError;
      const label = isProviderFailed ? 'FAILED_PROVIDER' : 'All providers failed';
      console.warn(`[Renderer] ${label}, using gradient fallback: ${err instanceof Error ? err.message : err}`);
      baseImageBuffer = await generateFallbackBackground(width, height);
      imageSource = 'fallback';
    }
  } else {
    console.log(`[Renderer] No image provider — using fallback background`);
    baseImageBuffer = await generateFallbackBackground(width, height);
    imageSource = 'fallback';
  }

  // ── Step 3: Visual Presence Gate ──
  if (imageSource === 'fallback') {
    console.warn(`[Renderer] VISUAL_MISSING — no meaningful visual subject (source: fallback)`);

    const overlaySvg = buildOverlaySvg(promptOutput, width, height, visualStyle);
    const previewImage = await sharp(baseImageBuffer)
      .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
      .png({ quality: 90 })
      .toBuffer();

    return {
      approved: false,
      image: previewImage,
      rawImage: baseImageBuffer,
      promptOutput,
      imageSource,
      imageModel,
      providerError,
      providerErrorStatus,
      visualMissing: true,
    };
  }

  // ── Step 3b: Hard Text Zone Readability Gate ──
  try {
    const zoneAnalysis = await analyzeImageZones(baseImageBuffer);
    const anyUsableZone = zoneAnalysis.zones.find(z => !z.rejected && z.score >= 40);

    if (!anyUsableZone) {
      console.error(`[Renderer] BLOCKED_PROVIDER_LAYOUT — no usable text zone in generated image`);

      const overlaySvg = buildOverlaySvg(promptOutput, width, height, visualStyle);
      const previewImage = await sharp(baseImageBuffer)
        .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
        .png({ quality: 90 })
        .toBuffer();

      return {
        approved: false,
        image: previewImage,
        rawImage: baseImageBuffer,
        promptOutput,
        imageSource,
        imageModel,
        providerError,
        providerErrorStatus,
        visualMissing: false,
      };
    }
  } catch (err) {
    console.warn(`[Renderer] Zone readability check failed: ${err instanceof Error ? err.message : err} — proceeding`);
  }

  // ── Step 4: Build SVG text overlay ──
  const overlaySvg = buildOverlaySvg(promptOutput, width, height, visualStyle);

  // ── Step 5: Composite text on image ──
  const compositeInputs: Array<{ input: Buffer; top: number; left: number }> = [
    { input: Buffer.from(overlaySvg), top: 0, left: 0 },
  ];
  if (visualStyle.logoBase64) {
    try {
      const logoInput = await buildLogoCompositeInput(visualStyle, { width, height });
      compositeInputs.push(logoInput);
    } catch (logoErr) {
      console.warn(`[Renderer] Logo composite failed: ${logoErr instanceof Error ? logoErr.message : String(logoErr)}`);
    }
  }
  const finalImage = await sharp(baseImageBuffer)
    .composite(compositeInputs)
    .png({ quality: 90 })
    .toBuffer();

  console.log(`[Renderer] Final image: ${width}x${height}, ${(finalImage.length / 1024).toFixed(0)}KB`);

  return {
    approved: true,
    image: finalImage,
    rawImage: baseImageBuffer,
    promptOutput,
    imageSource,
    imageModel,
    providerError,
    providerErrorStatus,
    visualMissing: false,
  };
}

// ─── Layout-First OPENER Renderer ────────────────────────────────

/**
 * Render an OPENER slide using the layout-first approach:
 * image on top (1080×1030), text bar on bottom (1080×320).
 *
 * Same visual structure as FACT slides — no gradient overlays,
 * no text-over-image cropping issues. Text lives in its own space.
 */
async function renderOpenerLayoutFirst(
  input: OpenerSlideInput,
  promptOutput: PromptBuilderOutput,
  imageProvider: ImageGenerator,
  style: ChannelVisualStyleContext = DEFAULT_VISUAL_STYLE,
): Promise<RenderResult> {
  let imageSource: ImageSourceProvider;
  let imageModel: string | undefined;
  let providerError: string | undefined;
  let providerErrorStatus: number | undefined;
  let baseImageBuffer: Buffer;

  try {
    console.log(`[Renderer] OPENER layout-first: generating image...`);
    console.log(`[Renderer] Prompt: ${promptOutput.imagePrompt}`);

    const result = await generateLayoutFirstImage(
      promptOutput.imagePrompt,
      imageProvider,
      { slideRole: input.slideRole },
    );

    baseImageBuffer = result.image;
    imageSource = result.imageSource;
    imageModel = result.meta.model;
    providerError = result.providerError;
    providerErrorStatus = result.providerErrorStatus;
    console.log(`[Renderer] Layout-first image composed via ${result.imageSource} (${result.meta.durationMs}ms)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Renderer] OPENER layout-first FAILED: ${msg} — using fallback`);
    baseImageBuffer = await generateFallbackBackground(CANVAS.width, CANVAS.height);
    imageSource = 'fallback';
  }

  if (imageSource === 'fallback') {
    return {
      approved: false,
      image: baseImageBuffer,
      rawImage: baseImageBuffer,
      promptOutput,
      imageSource,
      imageModel,
      providerError,
      providerErrorStatus,
      visualMissing: true,
    };
  }

  // Build text overlay for the bar area (bottom 320px)
  const title = input.displayTitle;
  const support = input.displaySupport;

  const pairing = getFontPairing(style.fontPairingId);
  const displayFontFamily = `'${pairing.display.family}', sans-serif`;
  const bodyFontFamily = style.monoFont
    ? `'${pairing.display.family}', sans-serif`
    : `'${pairing.body.family}', serif`;
  const t1Color = style.headlineColor ?? '#FFFFFF';
  const t2Color = style.bodyColor ?? '#B0B0B0';
  const emphasisColor = style.emphasisColor ?? COLOR_PALETTE.accentPrimary;

  const TEXT_PAD = 65;
  const t1Size = 72;
  const t1Weight = pairing.display.weight;
  const t1LineHeight = 1.15;
  const t2Size = 36;
  const t2Weight = 400;
  const t2LineHeight = 1.5;

  // Width-aware line breaking: wrap lines that would overflow the bar.
  // ~0.50 em per char for Inter 800 weight at this size.
  const availableWidth = CANVAS.width - 2 * TEXT_PAD;
  const charWidth = t1Size * 0.50;

  function wrapToFit(text: string): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current: string[] = [];

    for (const word of words) {
      const testLine = [...current, word].join(' ');
      if (testLine.length * charWidth > availableWidth && current.length > 0) {
        lines.push(current.join(' '));
        current = [word];
      } else {
        current.push(word);
      }
    }
    if (current.length > 0) lines.push(current.join(' '));
    return lines;
  }

  const titleLines = wrapToFit(title);

  // Layout in the bar
  const barTop = TEXT_BAR.y;
  const contentLeft = TEXT_PAD;
  const startY = barTop + TEXT_BAR.paddingTop;

  const textElements: string[] = [];

  // T1 lines
  titleLines.forEach((line, i) => {
    const y = startY + t1Size + i * (t1Size * t1LineHeight);
    const spans = buildEmphasisSpans(line, t1Color, emphasisColor, t1Size, t1Weight);
    textElements.push(
      `<text x="${contentLeft}" y="${Math.round(y)}" `
      + `font-family="${displayFontFamily}" `
      + `font-size="${t1Size}" font-weight="${t1Weight}" `
      + `letter-spacing="-1.5">`
      + spans
      + `</text>`
    );
  });

  // T2 support text
  if (support && support !== '—') {
    const t2Y = startY + t1Size + (titleLines.length - 1) * (t1Size * t1LineHeight) + t2Size * 1.2;
    textElements.push(
      `<text x="${contentLeft}" y="${Math.round(t2Y)}" `
      + `font-family="${bodyFontFamily}" `
      + `font-size="${t2Size}" font-weight="${t2Weight}" `
      + `fill="${t2Color}">`
      + escapeXml(support)
      + `</text>`
    );
  }

  // "Swipe to learn why →" CTA at the bottom of the text bar
  const ctaPad = TEXT_PAD;
  const ctaY = CANVAS.height - 45;
  const ctaMaxWidth = CANVAS.width - 2 * ctaPad;
  const swipeCtaSvg = buildSwipeCtaSvg(ctaPad, ctaY, ctaMaxWidth);
  textElements.push(swipeCtaSvg);

  // Full-canvas gradient overlay — same as FACT slides
  const fontStyleBlock = buildFontStyleBlock(pairing, style.monoFont);
  const gradientOverlay = `
    <defs>
      ${fontStyleBlock}
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

  const overlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}">
    ${gradientOverlay}
    ${textElements.join('\n    ')}
  </svg>`;

  const layoutFirstComposites: Array<{ input: Buffer; top: number; left: number }> = [
    { input: Buffer.from(overlaySvg), top: 0, left: 0 },
  ];
  if (style.logoBase64) {
    try {
      const logoInput = await buildLogoCompositeInput(style, CANVAS);
      layoutFirstComposites.push(logoInput);
    } catch (logoErr) {
      console.warn(`[Renderer] OPENER logo composite failed: ${logoErr instanceof Error ? logoErr.message : String(logoErr)}`);
    }
  }
  const finalImage = await sharp(baseImageBuffer)
    .composite(layoutFirstComposites)
    .png({ quality: 90 })
    .toBuffer();

  console.log(`[Renderer] OPENER layout-first final: ${CANVAS.width}x${CANVAS.height}, ${(finalImage.length / 1024).toFixed(0)}KB`);

  return {
    approved: true,
    image: finalImage,
    rawImage: baseImageBuffer,
    promptOutput,
    imageSource,
    imageModel,
    providerError,
    providerErrorStatus,
    visualMissing: false,
  };
}

/**
 * Render and save an OPENER slide to disk.
 */
export async function renderAndSaveOpenerSlide(
  input: OpenerSlideInput,
  outputPath: string,
  imageProvider?: ImageGenerator
): Promise<RenderResult> {
  const result = await renderOpenerSlide(input, imageProvider);

  if (!result.approved) {
    console.warn(`[Renderer] Slide not approved (VISUAL_MISSING) — not saving to disk`);
    return result;
  }

  const fs = await import('fs/promises');
  const path = await import('path');

  // Ensure output directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, result.image);

  console.log(`[Renderer] Saved to: ${outputPath}`);

  return { ...result, savedTo: outputPath };
}
