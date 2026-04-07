/**
 * Stacked Layout Architecture — Visual Validation Test
 *
 * 3-slide fact carousel:
 *   1. Flamingos → flamboyance
 *   2. Bananas → berries
 *   3. Octopuses → three hearts
 *
 * Architecture:
 *   - 1080 × 1350 final canvas
 *   - Top image: 1080 × 1030 (Gemini-generated, no text)
 *   - Bottom bar: 1080 × 320 (solid #111827, SVG text only)
 *   - No overlap, no gradients, no side panels
 *
 * Typography:
 *   - Inter, headline 52px/700/white, support 30px/400/white@80%
 *   - Padding: 64px horizontal, 44px top, 28px gap
 *
 * Usage:
 *   npx tsx scripts/render-stacked-test.ts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import path from 'path';
import fs from 'fs/promises';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp');
import { getUnifiedImageProvider, createCarouselSession } from '../src/lib/ai/image-provider';
// Layout compositor imported for constants only (prompts are already simplified)

// ─── Layout Constants ─────────────────────────────────────────────

const CANVAS = { width: 1080, height: 1350 };
const IMAGE_REGION = { width: 1080, height: 1030, y: 0 };
const TEXT_BAR = {
  width: 1080,
  height: 320,
  y: 1030,
  color: '#111827',   // requested dark fill
  paddingX: 64,
  paddingTop: 44,
  gap: 28,             // gap between headline and support
};

const TYPO = {
  headline: { size: 52, weight: 700, lineHeight: 1.25 },
  support:  { size: 30, weight: 400, lineHeight: 1.35 },
};

// ─── Slide Definitions ────────────────────────────────────────────

interface SlideDefinition {
  id: string;
  headline: string;
  support: string;
  keepTogether: string[];
  imagePrompt: string;
}

const SLIDES: SlideDefinition[] = [
  {
    id: 'flamingos',
    headline: 'A group of flamingos is called a flamboyance',
    support: 'The name matches the spectacle.',
    keepTogether: ['called a flamboyance'],
    imagePrompt:
      'A crowd of flamingos at eye level, several with wings fully spread mid-display, necks arched dramatically. ' +
      'Vivid hot pink feathers catching golden hour light, chaotic and theatrical energy. ' +
      'Photorealistic wildlife photography, shallow depth of field, warm golden light. ' +
      'No text, no watermarks, no labels.',
  },
  {
    id: 'bananas',
    headline: 'Bananas are berries, strawberries are not',
    support: 'The seeds tell the real story.',
    keepTogether: ['strawberries are not'],
    imagePrompt:
      'Split composition: left half shows a banana cross-section with a visible row of small dark seeds embedded deep inside the creamy flesh. ' +
      'Right half shows a strawberry cross-section with tiny seeds dotting only the outer red surface, none inside the pale interior. ' +
      'Both halves fill the frame edge to edge, pressed together with no gap, creating a direct side-by-side comparison. ' +
      'Extreme close-up macro photography, clinical sharpness on seed detail, soft even lighting. ' +
      'No text, no watermarks, no labels.',
  },
  {
    id: 'octopus',
    headline: 'Octopuses have three hearts',
    support: 'Three pulses. One animal.',
    keepTogether: ['three hearts', 'three pulses'],
    imagePrompt:
      'Underwater close-up of a live octopus with slightly translucent pale skin, ' +
      'faint blue veins branching across the mantle and down toward the base of the gills where the skin is thinnest. ' +
      'Three subtle darker shapes are barely visible beneath the skin of the mantle — internal organs faintly showing through. ' +
      'Natural ocean light from above, dark blue-green water behind, shallow depth of field. ' +
      'Photorealistic underwater wildlife photography, like a rare National Geographic shot. ' +
      'No text, no watermarks, no labels.',
  },
];

// ─── Deterministic Line Breaking ──────────────────────────────────

const BREAK_BEFORE = new Set([
  'is', 'are', 'was', 'were', 'has', 'have', 'had',
  'that', 'which', 'because', 'when', 'while', 'but', 'and', 'or',
  'called', 'not',
]);

function breakLines(
  text: string,
  fontSize: number,
  maxWidth: number,
  maxLines: number,
  keepTogether: string[],
): string[] {
  const words = text.split(/\s+/);
  if (words.length === 0) return [];

  // Approximate char width at given font size (Inter average ~0.48em)
  const charWidth = fontSize * 0.48;
  const maxCharsPerLine = Math.floor(maxWidth / charWidth);

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const test = current + ' ' + word;

    // Check if adding this word would exceed line width
    if (test.length > maxCharsPerLine) {
      lines.push(current);
      current = word;
      continue;
    }

    // Check if we should break before this word for readability
    if (
      BREAK_BEFORE.has(word.toLowerCase()) &&
      current.split(/\s+/).length >= 2 &&
      lines.length < maxLines - 1
    ) {
      // But don't break if it would split a keep-together phrase
      const wouldBreakKeep = keepTogether.some(phrase => {
        const phraseLower = phrase.toLowerCase();
        const testLower = test.toLowerCase();
        const currentLower = current.toLowerCase();
        return testLower.includes(phraseLower) && !currentLower.includes(phraseLower);
      });

      if (!wouldBreakKeep) {
        lines.push(current);
        current = word;
        continue;
      }
    }

    current = test;
  }
  lines.push(current);

  // Enforce max lines — if we exceed, merge last lines
  while (lines.length > maxLines) {
    const last = lines.pop()!;
    lines[lines.length - 1] += ' ' + last;
  }

  // Anti-widow: if last line is a single short word, pull from previous
  if (lines.length > 1) {
    const lastLine = lines[lines.length - 1];
    if (lastLine.split(/\s+/).length === 1 && lastLine.length < 6) {
      const prevWords = lines[lines.length - 2].split(/\s+/);
      if (prevWords.length > 2) {
        const pulled = prevWords.pop()!;
        lines[lines.length - 2] = prevWords.join(' ');
        lines[lines.length - 1] = pulled + ' ' + lastLine;
      }
    }
  }

  return lines;
}

// ─── SVG Text Bar Builder ─────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildTextBarSvg(
  headlineLines: string[],
  supportLines: string[],
): string {
  const elements: string[] = [];
  const x = TEXT_BAR.paddingX;
  let y = TEXT_BAR.y + TEXT_BAR.paddingTop;

  // Headline lines
  for (let i = 0; i < headlineLines.length; i++) {
    y += TYPO.headline.size; // baseline
    elements.push(
      `<text x="${x}" y="${Math.round(y)}" `
      + `font-family="'Inter', 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" `
      + `font-size="${TYPO.headline.size}" font-weight="${TYPO.headline.weight}" `
      + `fill="white" letter-spacing="-0.5">`
      + escapeXml(headlineLines[i])
      + `</text>`
    );
    if (i < headlineLines.length - 1) {
      y += (TYPO.headline.size * TYPO.headline.lineHeight) - TYPO.headline.size;
    }
  }

  // Gap
  y += TEXT_BAR.gap;

  // Support lines
  for (let i = 0; i < supportLines.length; i++) {
    y += TYPO.support.size;
    elements.push(
      `<text x="${x}" y="${Math.round(y)}" `
      + `font-family="'Inter', 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" `
      + `font-size="${TYPO.support.size}" font-weight="${TYPO.support.weight}" `
      + `fill="white" opacity="0.8">`
      + escapeXml(supportLines[i])
      + `</text>`
    );
    if (i < supportLines.length - 1) {
      y += (TYPO.support.size * TYPO.support.lineHeight) - TYPO.support.size;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}">
  <rect x="0" y="${TEXT_BAR.y}" width="${TEXT_BAR.width}" height="${TEXT_BAR.height}" fill="${TEXT_BAR.color}"/>
  ${elements.join('\n  ')}
</svg>`;
}

// ─── Image Generation ─────────────────────────────────────────────

async function generateImage(prompt: string, provider: ReturnType<typeof createCarouselSession>): Promise<{
  buffer: Buffer;
  source: string;
  model?: string;
  durationMs: number;
  inputSize: string;
}> {
  const result = await provider.generateImage(prompt, {
    slideRole: 'FACT',
    width: 768,
    height: 1024,
  });

  const meta = await sharp(result.data).metadata();
  const inputSize = `${meta.width}x${meta.height}`;

  return {
    buffer: result.data,
    source: result.imageSource,
    model: result.meta.model,
    durationMs: result.meta.durationMs,
    inputSize,
  };
}

// ─── Slide Assembly ───────────────────────────────────────────────

async function assembleSlide(imageBuffer: Buffer): Promise<Buffer> {
  // Resize image to exact image region
  const imageRegion = await sharp(imageBuffer)
    .resize(IMAGE_REGION.width, IMAGE_REGION.height, {
      fit: 'cover',
      position: 'centre',
    })
    .png()
    .toBuffer();

  // Create canvas with bar color as base
  const canvasSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}">
    <rect x="0" y="0" width="${CANVAS.width}" height="${CANVAS.height}" fill="${TEXT_BAR.color}"/>
  </svg>`;

  const canvas = await sharp(Buffer.from(canvasSvg)).png().toBuffer();

  // Place image at top
  return sharp(canvas)
    .composite([{ input: imageRegion, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  STACKED LAYOUT — Visual Validation Test                ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log(`Canvas:    ${CANVAS.width}×${CANVAS.height}`);
  console.log(`Image:     ${IMAGE_REGION.width}×${IMAGE_REGION.height} (top)`);
  console.log(`Text bar:  ${TEXT_BAR.width}×${TEXT_BAR.height} (bottom, ${TEXT_BAR.color})`);
  console.log(`Headline:  Inter ${TYPO.headline.size}px/${TYPO.headline.weight} white`);
  console.log(`Support:   Inter ${TYPO.support.size}px/${TYPO.support.weight} white@80%`);
  console.log(`Padding:   ${TEXT_BAR.paddingX}px horizontal, ${TEXT_BAR.paddingTop}px top, ${TEXT_BAR.gap}px gap`);
  console.log(`Slides:    ${SLIDES.length}\n`);

  const outputDir = path.resolve(__dirname, '..', 'output', 'stacked-test');
  await fs.mkdir(outputDir, { recursive: true });

  // Set up Gemini provider
  const unified = getUnifiedImageProvider();
  const session = createCarouselSession(unified);
  console.log(`Provider:  Gemini (primary) → Stability AI (fallback)`);
  console.log(`Model:     ${unified.resolveModel('FACT')}\n`);

  const textAvailableWidth = TEXT_BAR.width - 2 * TEXT_BAR.paddingX; // 952px

  const results: Array<{
    id: string;
    status: 'OK' | 'FAILED';
    headlineLines: string[];
    supportLines: string[];
    imageSource?: string;
    imageModel?: string;
    inputSize?: string;
    fileSize?: string;
    file?: string;
    error?: string;
  }> = [];

  const startTime = Date.now();

  for (let i = 0; i < SLIDES.length; i++) {
    const slide = SLIDES[i];
    const slideNum = i + 1;
    const filename = `slide-${slideNum}-${slide.id}.png`;
    const outputPath = path.resolve(outputDir, filename);

    console.log(`${'━'.repeat(60)}`);
    console.log(`SLIDE ${slideNum}: ${slide.id}`);
    console.log(`${'━'.repeat(60)}`);

    try {
      // Step 1: Break lines
      const headlineLines = breakLines(
        slide.headline,
        TYPO.headline.size,
        textAvailableWidth,
        3,
        slide.keepTogether,
      );
      const supportLines = breakLines(
        slide.support,
        TYPO.support.size,
        textAvailableWidth,
        2,
        [],
      );

      console.log(`  Headline: ${JSON.stringify(headlineLines)}`);
      console.log(`  Support:  ${JSON.stringify(supportLines)}`);

      // Step 2: Generate image via Gemini
      console.log(`  Generating image...`);
      const img = await generateImage(slide.imagePrompt, session);
      console.log(`  Image: ${img.source} (${img.model}), ${img.inputSize}, ${img.durationMs}ms`);

      // Step 3: Assemble canvas (image + bar)
      const canvas = await assembleSlide(img.buffer);

      // Step 4: Build SVG text overlay
      const textSvg = buildTextBarSvg(headlineLines, supportLines);

      // Step 5: Composite text onto canvas
      const final = await sharp(canvas)
        .composite([{ input: Buffer.from(textSvg), top: 0, left: 0 }])
        .png({ quality: 90 })
        .toBuffer();

      // Step 6: Save
      await fs.writeFile(outputPath, final);
      const fileSize = `${(final.length / 1024).toFixed(0)}KB`;
      console.log(`  Output: ${filename} (${fileSize})`);

      results.push({
        id: slide.id,
        status: 'OK',
        headlineLines,
        supportLines,
        imageSource: img.source,
        imageModel: img.model,
        inputSize: img.inputSize,
        fileSize,
        file: outputPath,
      });

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  FAILED: ${msg}`);
      results.push({
        id: slide.id,
        status: 'FAILED',
        headlineLines: [],
        supportLines: [],
        error: msg,
      });
    }

    console.log();
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // ── Summary ───────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log('RESULTS');
  console.log(`${'═'.repeat(60)}\n`);

  for (const r of results) {
    console.log(`  ${r.id}: ${r.status}`);
    if (r.status === 'OK') {
      console.log(`    Source:    ${r.imageSource} (${r.imageModel})`);
      console.log(`    Input:    ${r.inputSize}`);
      console.log(`    Size:     ${r.fileSize}`);
      console.log(`    Headline: ${JSON.stringify(r.headlineLines)}`);
      console.log(`    Support:  ${JSON.stringify(r.supportLines)}`);
      console.log(`    File:     ${r.file}`);
    } else {
      console.log(`    Error:    ${r.error}`);
    }
    console.log();
  }

  const ok = results.filter(r => r.status === 'OK').length;
  const failed = results.filter(r => r.status === 'FAILED').length;

  console.log(`  Duration:  ${duration}s`);
  console.log(`  OK:        ${ok}/${results.length}`);
  console.log(`  Failed:    ${failed}/${results.length}`);
  console.log(`  Output:    ${outputDir}`);

  // Provider consistency
  const sources = new Set(results.filter(r => r.imageSource).map(r => r.imageSource));
  console.log(`  Provider:  ${[...sources].join(', ')} (${sources.size <= 1 ? 'UNIFORM' : 'MIXED'})`);

  // Verdict
  const allOk = ok === results.length;
  const uniform = sources.size <= 1;
  console.log(`\n  VERDICT: ${allOk && uniform ? 'PASS — all slides rendered, uniform provider' : 'NEEDS REVIEW'}`);
  console.log();
}

main().catch(err => {
  console.error('Stacked test failed:', err);
  process.exit(1);
});
