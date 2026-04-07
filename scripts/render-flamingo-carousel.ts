/**
 * Render: Flamingo "Flamboyance" Carousel
 *
 * Generates a full Instagram carousel (1080x1350 per slide)
 * communicating the fact: "A group of flamingos is called a flamboyance"
 *
 * Bypasses the template/intent/distortion pipeline (designed for tech content)
 * and sends curated prompts directly to Gemini with clean text overlay.
 *
 * Usage:
 *   npx tsx scripts/render-flamingo-carousel.ts                # Fallback backgrounds
 *   npx tsx scripts/render-flamingo-carousel.ts --gemini       # Gemini-generated images
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import path from 'path';
import fs from 'fs/promises';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp');
import { getUnifiedImageProvider, createCarouselSession, CarouselRestartNeeded, type CarouselImageSession, type ImageGenerator } from '../src/lib/ai/image-provider';
import { ProviderFailedError } from '../src/lib/ai/retry';

const USE_GEMINI = process.argv.includes('--gemini');
const WIDTH = 1080;
const HEIGHT = 1350;

// ─── Slide Definitions ──────────────────────────────────────────

interface SlideDefinition {
  /** Model tier: 'pro' for hero slides, 'flash' for mid-carousel */
  tier: 'pro' | 'flash';
  /** Title displayed on slide */
  displayTitle: string;
  /** Supporting text beneath title */
  displaySupport: string;
  /** Raw image prompt — sent directly to Gemini, no template wrapping */
  imagePrompt: string;
}

const SLIDES: SlideDefinition[] = [
  // Slide 1 — OPENER: Stop the scroll. Theatrical group shot on stage.
  {
    tier: 'pro',
    displayTitle: 'They didn\'t just show up',
    displaySupport: 'They performed.',
    imagePrompt:
      'Five flamingos standing in a row on a dark minimalist theatrical stage, each performing a different exaggerated flamboyant pose — one with wings dramatically spread wide, one in an extreme elegant S-curve neck pose, one mid-dynamic twist with body rotation, one with feathers puffed up proudly chest forward, one in a bold confrontational stance leaning toward camera. Strong overhead theatrical spotlights casting visible white light beams through subtle atmospheric haze. Deep black stage background. Slight reflective glossy floor catching pink light and flamingo reflections. Ultra-realistic cinematic fashion photography. Rich vivid hot pink flamingos with detailed feather texture contrasting against deep dark background. Wide symmetrical composition with even spacing between birds. Eye-level camera angle. Dramatic showy performative energy. 3:4 portrait aspect ratio. No text, no props, no costumes, no natural setting, no water, no zoo.',
  },

  // Slide 2 — REVEAL: Introduce the word. Single flamingo solo spotlight.
  {
    tier: 'pro',
    displayTitle: 'A group of flamingos',
    displaySupport: 'is called a flamboyance.',
    imagePrompt:
      'A single flamingo in an extreme dramatic pose with both wings fully extended upward like a ballet dancer taking a final bow, standing alone center-stage under a single brilliant white spotlight beam cutting through darkness. Deep black background. Theatrical haze catching the spotlight creating a visible cone of light. The flamingo\'s vivid hot pink feathers glowing intensely against the pure darkness. Dramatic low angle from slightly below looking up at the bird. Cinematic rim lighting highlighting individual feather texture and edges. Reflective dark glossy floor showing the flamingo\'s mirror reflection. Fashion editorial portrait photography style. 3:4 portrait aspect ratio. 8K photorealistic. No text, no props, no natural environment.',
  },

  // Slide 3 — GROUP: Show the competitive energy. Multiple flamingos, each unique.
  {
    tier: 'flash',
    displayTitle: 'Every single one',
    displaySupport: 'competing to be the most dramatic.',
    imagePrompt:
      'Three flamingos in a dramatic triangular formation on a dark theatrical stage, each striking a completely different exaggerated theatrical pose — the center one with neck arched impossibly far back in an extreme backbend, the left one mid-confident strut with one leg lifted high like a runway model, the right one with wings fanned out in full magnificent display. Strong overhead spotlights creating dramatic shadows and bright light pools on the reflective glossy floor. Vivid saturated hot pink plumage glowing against deep charcoal-black background. Cinematic wide shot. High fashion runway show aesthetic. Subtle atmospheric haze. Photorealistic 8K. 3:4 portrait aspect ratio. No text, no natural environment, no water, no zoo.',
  },

  // Slide 4 — CLOSE-UP: The word perfectly fits. Exaggerated portrait.
  {
    tier: 'flash',
    displayTitle: 'The most extra bird',
    displaySupport: 'got the most extra name.',
    imagePrompt:
      'Extreme close-up portrait of a single flamingo face and elegantly curved neck filling 70 percent of the frame. The bird appears to be posing deliberately with a slightly tilted head and half-closed eyes as if modeling for a high fashion magazine cover. Vivid hot pink feathers with incredible fine texture detail visible on every plume. Dramatic side-lighting creating deep cinematic shadows and bright highlights on the curved black-tipped beak. Shallow depth of field with soft bokeh background showing blurred silhouettes of more flamingos in theatrical poses behind. Dark moody studio background. Fashion portrait photography with beauty lighting. Cinematic color grading with rich pink tones and deep teal shadow accents. 3:4 portrait aspect ratio. 8K photorealistic. No text.',
  },

  // Slide 5 — CTA: Memorable exit. Group "curtain call" walking forward.
  {
    tier: 'pro',
    displayTitle: 'Follow for more',
    displaySupport: 'facts that sound made up.',
    imagePrompt:
      'Five flamingos in a confident V-formation walking directly toward the camera on a dark reflective stage surface. Strong backlighting creating dramatic glowing silhouette edges with vivid pink rim light outlining their feathers and bodies. The center flamingo slightly ahead of the others with wings partially spread as if leading a fashion show finale. Theatrical spotlights from above creating visible light cones cutting through atmospheric haze. Deep blue-black background. The wet reflective floor showing mirror reflections of the walking birds. Cinematic ultra-wide composition. Fashion show finale runway aesthetic. Photorealistic 8K. Confident powerful forward energy. 3:4 portrait aspect ratio. No text, no natural setting.',
  },
];

// ─── Text Overlay (SVG) ─────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildOverlaySvg(
  title: string,
  support: string,
  w: number,
  h: number,
): string {
  // Gradient: strong at top and bottom for text readability
  const gradient = `
    <defs>
      <linearGradient id="tp" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000" stop-opacity="0.82"/>
        <stop offset="22%" stop-color="#000" stop-opacity="0.15"/>
        <stop offset="75%" stop-color="#000" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.75"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#tp)"/>`;

  // Title — top area, large bold
  const titleY = 100;
  const titleLines = breakLines(title, 18); // ~18 chars per line at this size
  const titleElements = titleLines.map((line, i) =>
    `<text x="${w / 2}" y="${titleY + i * 72}" text-anchor="middle" font-size="62" font-weight="800" letter-spacing="-1" font-family="'Inter','SF Pro Display','Segoe UI',Arial,sans-serif" fill="#FFFFFF">${escapeXml(line)}</text>`
  ).join('\n    ');

  // Support — bottom area, smaller
  const supportY = h - 80;
  const supportElements =
    `<text x="${w / 2}" y="${supportY}" text-anchor="middle" font-size="32" font-weight="500" letter-spacing="0.5" font-family="'Inter','SF Pro Display','Segoe UI',Arial,sans-serif" fill="rgba(255,255,255,0.88)">${escapeXml(support)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${gradient}
    ${titleElements}
    ${supportElements}
  </svg>`;
}

function breakLines(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && (current + ' ' + word).length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ─── Fallback Background ────────────────────────────────────────

async function generateFallbackBackground(w: number, h: number): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <radialGradient id="glow" cx="50%" cy="40%" r="55%">
        <stop offset="0%" stop-color="#3a0a1e" stop-opacity="0.8"/>
        <stop offset="60%" stop-color="#1a0510" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="#0a0a0a" stop-opacity="1"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="#0a0a0a"/>
    <rect width="${w}" height="${h}" fill="url(#glow)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Flamingo "Flamboyance" Carousel Renderer   ║');
  console.log('╚══════════════════════════════════════════════╝\n');
  console.log(`Mode: ${USE_GEMINI ? 'Gemini image generation' : 'Fallback gradients'}`);
  console.log(`Slides: ${SLIDES.length}`);
  console.log(`Format: ${WIDTH}x${HEIGHT} (Instagram carousel 4:5)\n`);

  const unified = USE_GEMINI ? getUnifiedImageProvider() : undefined;
  let session: CarouselImageSession | undefined;

  if (unified) {
    session = createCarouselSession(unified);
    console.log(`[Config] Carousel session (primary: Gemini, secondary: Stability AI SD3)\n`);
  }

  const imageProvider: ImageGenerator | undefined = session;

  const outputDir = path.resolve(__dirname, '..', 'output', 'flamingo-carousel');
  await fs.mkdir(outputDir, { recursive: true });

  interface SlideResult {
    slide: number;
    source: string;
    size: string;
    file: string;
    status: 'OK' | 'VISUAL_MISSING' | 'FAILED_PROVIDER';
    failedStep?: string;
    error?: string;
  }

  let results: SlideResult[] = [];
  let failedCount = 0;
  let fallbackCount = 0;

  // ── Carousel render pass (supports provider-lock restart) ────────
  async function renderAllSlides(provider: ImageGenerator | undefined): Promise<{ results: SlideResult[]; restartNeeded: boolean }> {
    const passResults: SlideResult[] = [];
    let restartNeeded = false;

    for (let i = 0; i < SLIDES.length; i++) {
      const slide = SLIDES[i];
      const slideNum = i + 1;
      const filename = `slide-${slideNum}.png`;
      const outputPath = path.resolve(outputDir, filename);

      console.log(`${'━'.repeat(60)}`);
      console.log(`SLIDE ${slideNum}/${SLIDES.length} [${slide.tier.toUpperCase()}]`);
      console.log(`  Title:   "${slide.displayTitle}"`);
      console.log(`  Support: "${slide.displaySupport}"`);

      try {
        let baseImageBuffer: Buffer;
        let imageSource: string;
        let slideStatus: SlideResult['status'] = 'OK';

        if (provider && USE_GEMINI) {
          try {
            const roleForModel = slide.tier === 'pro' ? 'HOOK' : 'FACT';
            const model = provider.resolveModel(roleForModel);
            console.log(`  Model:   ${model}`);
            console.log(`  Prompt:  ${slide.imagePrompt.slice(0, 100)}...`);

            const result = await provider.generateImage(slide.imagePrompt, {
              width: WIDTH,
              height: HEIGHT,
              slideRole: roleForModel,
            });

            baseImageBuffer = await sharp(result.data)
              .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
              .png()
              .toBuffer();

            imageSource = `${result.imageSource} (${result.meta.model})`;
            if (result.providerError) {
              console.warn(`  ! Primary failed, used fallback: ${result.providerError.slice(0, 100)}`);
            }
          } catch (err) {
            // Mid-carousel provider failure — trigger restart
            if (err instanceof CarouselRestartNeeded) {
              console.error(`  ✗ CAROUSEL RESTART NEEDED at slide ${slideNum}: ${err.message}`);
              restartNeeded = true;
              break;
            }

            const isProviderFailed = err instanceof ProviderFailedError;
            const errMsg = err instanceof Error ? err.message : String(err);

            if (isProviderFailed) {
              console.error(`  ✗ FAILED_PROVIDER at image_generation — ${errMsg}`);
              slideStatus = 'FAILED_PROVIDER';
            } else {
              console.warn(`  ! All image providers failed: ${errMsg}`);
            }

            console.warn(`  → Falling back to gradient background`);
            baseImageBuffer = await generateFallbackBackground(WIDTH, HEIGHT);
            imageSource = 'fallback';
            if (slideStatus !== 'FAILED_PROVIDER') slideStatus = 'VISUAL_MISSING';
          }
        } else {
          baseImageBuffer = await generateFallbackBackground(WIDTH, HEIGHT);
          imageSource = 'fallback';
          slideStatus = 'VISUAL_MISSING';
        }

        const overlaySvg = buildOverlaySvg(slide.displayTitle, slide.displaySupport, WIDTH, HEIGHT);

        const finalImage = await sharp(baseImageBuffer)
          .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
          .png({ quality: 90 })
          .toBuffer();

        if (slideStatus === 'OK') {
          await fs.writeFile(outputPath, finalImage);
        }

        const sizeKB = `${(finalImage.length / 1024).toFixed(0)}KB`;
        const statusIcon = slideStatus === 'OK' ? '✓' : slideStatus === 'VISUAL_MISSING' ? '▪' : '✗';
        passResults.push({ slide: slideNum, source: imageSource, size: sizeKB, file: filename, status: slideStatus });

        console.log(`  ${statusIcon} ${sizeKB} → ${filename} [${slideStatus}]\n`);

      } catch (err) {
        // Mid-carousel provider failure propagated through composite
        if (err instanceof CarouselRestartNeeded) {
          console.error(`  ✗ CAROUSEL RESTART NEEDED at slide ${i + 1}: ${err.message}`);
          restartNeeded = true;
          break;
        }

        const errMsg = err instanceof Error ? err.message : String(err);
        const failedStep = err instanceof ProviderFailedError ? 'image_generation' : 'render';
        console.error(`  ✗ SLIDE ${i + 1} CRASHED at ${failedStep}: ${errMsg}`);
        console.error(`  → Skipping slide ${i + 1}, continuing carousel\n`);

        passResults.push({
          slide: i + 1,
          source: 'none',
          size: '0KB',
          file: `slide-${i + 1}.png`,
          status: 'FAILED_PROVIDER',
          failedStep,
          error: errMsg,
        });
      }
    }

    return { results: passResults, restartNeeded };
  }

  // ── First pass ──
  const firstPass = await renderAllSlides(imageProvider);
  results = firstPass.results;

  // ── Restart pass (if mid-carousel failure) ──
  if (firstPass.restartNeeded && session) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log('CAROUSEL RESTART — re-rendering all slides with secondary provider');
    console.log(`${'═'.repeat(60)}\n`);

    session.resetForRestart();
    const secondPass = await renderAllSlides(session);
    results = secondPass.results;
  }

  // Compute counts
  failedCount = results.filter(r => r.status === 'FAILED_PROVIDER').length;
  fallbackCount = results.filter(r => r.status === 'VISUAL_MISSING').length;

  // ── Summary ──
  console.log(`${'═'.repeat(60)}`);
  console.log('CAROUSEL COMPLETE\n');

  if (session) {
    const summary = session.getSummary();
    console.log(`Provider lock: ${summary.lockedProvider ?? 'none'}`);
    console.log(`Restarted:     ${summary.wasRestarted ? `YES — ${summary.restartReason?.slice(0, 100)}` : 'no'}\n`);
  }

  console.log('Slide | Source                              | Size   | Status');
  console.log('──────┼─────────────────────────────────────┼────────┼────────────────');
  for (const r of results) {
    console.log(`  ${r.slide}   | ${r.source.padEnd(37)} | ${r.size.padEnd(6)} | ${r.status}`);
  }

  console.log(`\nOutput: ${outputDir}`);
  console.log(`Total: ${results.length} slides — ${results.length - failedCount - fallbackCount} OK, ${fallbackCount} VISUAL_MISSING, ${failedCount} FAILED_PROVIDER`);

  if (fallbackCount > 0) {
    console.warn(`\n⚠ ${fallbackCount} slide(s) VISUAL_MISSING — no real subject. Require retry or regeneration.`);
  }
  if (failedCount > 0) {
    console.warn(`⚠ ${failedCount} slide(s) FAILED_PROVIDER. Carousel is incomplete.`);
  }
}

main().catch(err => {
  console.error('Carousel render failed:', err);
  process.exit(1);
});
