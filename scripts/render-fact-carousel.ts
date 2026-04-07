/**
 * Multi-Slide Fact Carousel Renderer — Full Test
 *
 * Renders a complete 3-slide fact carousel with:
 *   - Locked 5-layer image prompts
 *   - Locked text overlay system (documentary style)
 *   - Per-slide text-fit validation
 *   - Gemini image generation (with retry + fallback resilience)
 *   - Per-slide isolation (one failure does not crash the run)
 *   - Carousel-level consistency evaluation
 *
 * Usage:
 *   npx tsx scripts/render-fact-carousel.ts                # Fallback backgrounds
 *   npx tsx scripts/render-fact-carousel.ts --gemini       # Gemini-generated images
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import path from 'path';
import fs from 'fs/promises';
import {
  renderAndSaveFactSlide,
  type FactSlideInput,
  type FactSlideRenderResult,
  type RenderStep,
} from '../src/lib/visual/fact-slide-renderer';
import { getUnifiedImageProvider, createCarouselSession, CarouselRestartNeeded, type CarouselImageSession, type ImageGenerator } from '../src/lib/ai/image-provider';
import { ProviderFailedError } from '../src/lib/ai/retry';
import { normalizeCarouselTypography, type CarouselTypographyResult } from '../src/lib/visual/carousel-typography';
import { validateTextFit, type TextFitInput } from '../src/lib/visual/text-fit-validator';
import { evaluatePerceptualConsistency } from '../src/lib/visual/carousel-consistency';
import type { RenderedLayout } from '../src/lib/visual/fact-slide-renderer';

const USE_GEMINI = process.argv.includes('--gemini');

// ─── Run-Level Timeouts ─────────────────────────────────────────

/** Max time for a single slide render (image generation + analysis + composite) */
const PER_SLIDE_TIMEOUT_MS = 180_000; // 3 minutes

/** Max time for the entire carousel render (all slides) */
const GLOBAL_TIMEOUT_MS = 360_000; // 6 minutes

/** Wrap a promise with a timeout. Rejects with a descriptive error on timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`TIMEOUT — ${label} exceeded ${(ms / 1000).toFixed(0)}s limit`)),
      ms,
    );
    promise.then(
      val => { clearTimeout(timer); resolve(val); },
      err => { clearTimeout(timer); reject(err); },
    );
  });
}

// ─── Slide Definitions (Locked Visual Concepts + 5-Layer Prompts) ─

interface CarouselSlide {
  id: string;
  fact: string;
  input: FactSlideInput;
}

const CAROUSEL_SLIDES: CarouselSlide[] = [
  // ── Slide 1: Flamingos ──────────────────────────────────────────
  {
    id: 'flamingos',
    fact: 'A group of flamingos is called a flamboyance',
    input: {
      slideType: 'fact',
      displayTitle: 'A group of flamingos is called a flamboyance',
      displaySupport: 'The name matches the spectacle.',
      textZone: 'bottom_right',
      forceZone: 'bottom_right',
      textMode: 'light-on-dark' as const,
      keepTogether: ['called a flamboyance'],
      slideRole: 'FACT',
      imagePrompt:
        'A crowd of flamingos at eye level, several with wings fully spread mid-display, necks arched dramatically. ' +
        'Vivid hot pink feathers catching golden hour light, chaotic and theatrical energy. ' +
        'Photorealistic wildlife photography, shallow depth of field, warm golden light. ' +
        'No text, no watermarks, no labels.',
    },
  },

  // ── Slide 2: Bananas / Strawberries ─────────────────────────────
  {
    id: 'bananas',
    fact: 'Bananas are berries, strawberries are not',
    input: {
      slideType: 'fact',
      displayTitle: 'Bananas are berries, strawberries are not',
      displaySupport: 'The seeds tell the real story.',
      textZone: 'bottom_right',
      forceZone: 'bottom_right',
      textMode: 'light-on-dark' as const,
      keepTogether: ['strawberries are not'],
      slideRole: 'FACT',
      imagePrompt:
        'Split composition: left half shows a banana cross-section with a visible row of small dark seeds embedded deep inside the creamy flesh. ' +
        'Right half shows a strawberry cross-section with tiny seeds dotting only the outer red surface, none inside the pale interior. ' +
        'Both halves fill the frame edge to edge, pressed together with no gap, creating a direct side-by-side comparison. ' +
        'Extreme close-up macro photography, clinical sharpness on seed detail, soft even lighting. ' +
        'No text, no watermarks, no labels.',
    },
  },

  // ── Slide 3: Octopus ───────────────────────────────────────────
  {
    id: 'octopus',
    fact: 'Octopuses have three hearts',
    input: {
      slideType: 'fact',
      displayTitle: 'Octopuses have three hearts',
      displaySupport: 'Three pulses. One animal.',
      textZone: 'bottom_right',
      forceZone: 'bottom_right',
      textMode: 'light-on-dark' as const,
      keepTogether: ['three hearts', 'three pulses'],
      slideRole: 'FACT',
      imagePrompt:
        'Underwater close-up of a live octopus with slightly translucent pale skin, ' +
        'faint blue veins branching across the mantle and down toward the base of the gills where the skin is thinnest. ' +
        'Three subtle darker shapes are barely visible beneath the skin of the mantle — internal organs faintly showing through. ' +
        'Natural ocean light from above, dark blue-green water behind, shallow depth of field. ' +
        'Photorealistic underwater wildlife photography, like a rare National Geographic shot. ' +
        'No text, no watermarks, no labels.',
    },
  },
];

// ─── Per-slide result tracking ──────────────────────────────────

type SlideStatus = 'APPROVED' | 'VISUAL_MISSING' | 'FAILED_PROVIDER' | 'BLOCKED';

interface SlideReport {
  id: string;
  slideNumber: number;
  fact: string;
  status: SlideStatus;
  imageSource?: string;
  imageModel?: string;
  validationApproved: boolean;
  fileSaved?: string;
  fileSize?: string;
  failedStep?: RenderStep | string;
  error?: string;
  t1Lines: string[];
  t2Lines: string[];
  zoneOccupancy: number;
  t1FontSize: number;
  t2FontSize: number;
  selectedZone?: string;
  renderedLayout?: RenderedLayout;
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  MULTI-SLIDE FACT CAROUSEL — Full Render Test           ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log(`Mode:   ${USE_GEMINI ? 'Gemini image generation + fallback' : 'Fallback gradients only'}`);
  console.log(`Slides: ${CAROUSEL_SLIDES.length}`);
  console.log(`Format: 1080x1350 (Instagram carousel 3:4)`);
  console.log(`Style:  Documentary / minimal`);
  console.log(`Retry:  3 attempts, 1s → 3s → 7s + jitter, retryable: 429/500/502/503/529\n`);

  const unified = USE_GEMINI ? getUnifiedImageProvider() : undefined;
  let session: CarouselImageSession | undefined;

  if (unified) {
    session = createCarouselSession(unified);
    console.log(`[Config] Carousel session (primary: Gemini, secondary: Stability AI SD3)`);
    console.log(`[Config] FACT model: ${unified.resolveModel('FACT')}\n`);
  }

  // Session is the image generator passed to renderers
  const imageProvider: ImageGenerator | undefined = session;

  const outputDir = path.resolve(__dirname, '..', 'output', 'fact-carousel');
  await fs.mkdir(outputDir, { recursive: true });

  // ── Typography Normalization Pass ─────────────────────────────────
  // Pre-validate all slides, then normalize T1 size across the carousel.
  console.log(`${'━'.repeat(64)}`);
  console.log('TYPOGRAPHY NORMALIZATION PASS');
  console.log(`${'━'.repeat(64)}`);

  const preValidations: Array<{
    id: string;
    input: TextFitInput;
    originalValidation: import('../src/lib/visual/text-fit-validator').ValidationResult;
  }> = [];

  for (const { id, input } of CAROUSEL_SLIDES) {
    const fitInput: TextFitInput = {
      slideType: input.slideType,
      displayTitle: input.displayTitle,
      displaySupport: input.displaySupport,
      textZone: input.textZone,
      keepTogether: input.keepTogether,
    };
    const result = validateTextFit(fitInput);
    preValidations.push({ id, input: fitInput, originalValidation: result });
    console.log(`  ${id}: T1=${result.t1FontSize}px, lines=${result.t1Lines.length}, approved=${result.approved}`);
    console.log(`    T1: ${JSON.stringify(result.t1Lines)}`);
  }

  const typoResult = normalizeCarouselTypography(preValidations);

  console.log(`\n  Mode: ${typoResult.mode}`);
  if (typoResult.sharedT1Size) {
    console.log(`  Shared T1: ${typoResult.sharedT1Size}px`);
  }
  if (typoResult.sharedT2Size) {
    console.log(`  Shared T2: ${typoResult.sharedT2Size}px`);
  }
  if (typoResult.mixedReason) {
    console.log(`  Reason: ${typoResult.mixedReason}`);
  }
  console.log(`  Rhythm: ${typoResult.rhythm.consistent ? 'CONSISTENT' : 'UNEVEN'} (max deviation: ${(typoResult.rhythm.maxDeviation * 100).toFixed(0)}%)`);

  for (const slide of typoResult.slides) {
    if (slide.sizeChanged) {
      console.log(`  ${slide.id}: ${slide.originalT1Size}px → ${slide.finalT1Size}px ${slide.stillApproved ? '(OK)' : '(FAIL)'}`);
      console.log(`    T1: ${JSON.stringify(slide.validation.t1Lines)}`);
    }
  }
  console.log();

  // Build a map of normalized T1 sizes per slide
  const normalizedT1: Record<string, number> = {};
  for (const slide of typoResult.slides) {
    normalizedT1[slide.id] = slide.finalT1Size;
  }

  let reports: SlideReport[] = [];
  const startTime = Date.now();

  // ── Carousel render pass (with provider-lock restart support) ────
  async function renderAllSlides(provider: ImageGenerator | undefined): Promise<{ reports: SlideReport[]; restartNeeded: boolean }> {
    const passReports: SlideReport[] = [];
    let restartNeeded = false;

    for (let i = 0; i < CAROUSEL_SLIDES.length; i++) {
      // Global timeout check
      const elapsed = Date.now() - startTime;
      if (elapsed >= GLOBAL_TIMEOUT_MS) {
        console.warn(`\n  ⏱ GLOBAL TIMEOUT (${(elapsed / 1000).toFixed(0)}s) — skipping remaining ${CAROUSEL_SLIDES.length - i} slide(s)`);
        for (let j = i; j < CAROUSEL_SLIDES.length; j++) {
          const { id: skipId, fact: skipFact } = CAROUSEL_SLIDES[j];
          passReports.push({
            id: skipId, slideNumber: j + 1, fact: skipFact,
            status: 'FAILED_PROVIDER', validationApproved: false,
            failedStep: 'image_generation', error: `TIMEOUT — global carousel budget exceeded (${(GLOBAL_TIMEOUT_MS / 1000).toFixed(0)}s)`,
            t1Lines: [], t2Lines: [], zoneOccupancy: 0, t1FontSize: 0, t2FontSize: 0,
          });
        }
        break;
      }

      const { id, fact, input: baseInput } = CAROUSEL_SLIDES[i];
      const slideNum = i + 1;
      const filename = `slide-${slideNum}-${id}.png`;
      const outputPath = path.resolve(outputDir, filename);

      const input = {
        ...baseInput,
        forceT1FontSize: normalizedT1[id],
      };

      console.log(`\n${'━'.repeat(64)}`);
      console.log(`SLIDE ${slideNum}/${CAROUSEL_SLIDES.length}: ${id}`);
      console.log(`${'━'.repeat(64)}`);
      console.log(`  Fact:    "${fact}"`);
      console.log(`  Title:   "${input.displayTitle}"`);
      console.log(`  Support: "${input.displaySupport ?? '(none)'}"`);
      console.log(`  Zone:    ${input.textZone}`);
      console.log(`  Keep:    [${(input.keepTogether ?? []).join(', ')}]`);

      try {
        const result: FactSlideRenderResult = await withTimeout(
          renderAndSaveFactSlide(input, outputPath, provider),
          PER_SLIDE_TIMEOUT_MS,
          `slide ${slideNum} (${id})`,
        );

        let status: SlideStatus;
        if (result.visualMissing) {
          status = 'VISUAL_MISSING';
        } else if (result.failedStep) {
          const isProvider = result.error?.includes('FAILED_PROVIDER') ||
            (result.failedStep === 'image_generation');
          status = isProvider ? 'FAILED_PROVIDER' : 'BLOCKED';
        } else if (!result.approved) {
          status = 'BLOCKED';
        } else {
          status = 'APPROVED';
        }

        const fileSize = result.image
          ? `${(result.image.length / 1024).toFixed(0)}KB`
          : undefined;

        passReports.push({
          id,
          slideNumber: slideNum,
          fact,
          status,
          imageSource: result.imageSource,
          imageModel: result.imageModel,
          validationApproved: result.validation.approved,
          fileSaved: result.savedTo,
          fileSize,
          failedStep: result.failedStep,
          error: result.error,
          t1Lines: result.validation.t1Lines,
          t2Lines: result.validation.t2Lines,
          zoneOccupancy: result.validation.zoneOccupancy,
          t1FontSize: result.validation.t1FontSize,
          t2FontSize: result.validation.t2FontSize,
          selectedZone: result.selectedZone ?? result.validation.textZone,
          renderedLayout: result.renderedLayout,
        });

        const icon = status === 'APPROVED' ? '✓' :
          status === 'VISUAL_MISSING' ? '▪' :
            status === 'FAILED_PROVIDER' ? '✗' : '▪';
        console.log(`\n  ${icon} [${status}] ${fileSize ?? '—'} → ${filename}`);

      } catch (err) {
        // Mid-carousel provider failure — trigger restart
        if (err instanceof CarouselRestartNeeded) {
          console.error(`\n  ✗ CAROUSEL RESTART NEEDED at slide ${slideNum}: ${err.message}`);
          restartNeeded = true;
          break;
        }

        const errMsg = err instanceof Error ? err.message : String(err);
        const isProvider = err instanceof ProviderFailedError;
        const isTimeout = errMsg.includes('TIMEOUT');
        const failedStep = isProvider ? 'image_generation' : isTimeout ? 'image_generation' : 'unknown';

        const label = isTimeout ? 'TIMEOUT' : isProvider ? 'FAILED_PROVIDER' : 'CRASHED';
        console.error(`\n  ✗ SLIDE ${slideNum} ${label}: ${errMsg}`);
        console.error(`  → Continuing to next slide\n`);

        passReports.push({
          id,
          slideNumber: slideNum,
          fact,
          status: 'FAILED_PROVIDER',
          validationApproved: false,
          failedStep,
          error: errMsg,
          t1Lines: [],
          t2Lines: [],
          zoneOccupancy: 0,
          t1FontSize: 0,
          t2FontSize: 0,
        });
      }
    }

    return { reports: passReports, restartNeeded };
  }

  // ── First pass: render with carousel session ──────────────────────
  const firstPass = await renderAllSlides(imageProvider);
  reports = firstPass.reports;

  // ── Restart pass: if session needs restart, re-render all slides ──
  if (firstPass.restartNeeded && session) {
    console.log(`\n${'═'.repeat(64)}`);
    console.log('CAROUSEL RESTART — re-rendering all slides with secondary provider');
    console.log(`${'═'.repeat(64)}\n`);

    session.resetForRestart();
    const secondPass = await renderAllSlides(session);
    reports = secondPass.reports;
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

  // ── Per-Slide Results ──────────────────────────────────────────
  console.log(`\n\n${'═'.repeat(64)}`);
  console.log('PER-SLIDE RESULTS');
  console.log(`${'═'.repeat(64)}`);

  for (const r of reports) {
    console.log(`\n  Slide ${r.slideNumber}: ${r.id}`);
    console.log(`    Status:     ${r.status}`);
    console.log(`    Validation: ${r.validationApproved ? 'APPROVED' : 'BLOCKED'}`);
    console.log(`    Source:     ${r.imageSource ?? 'none'}`);
    if (r.imageModel) console.log(`    Model:      ${r.imageModel}`);
    if (r.fileSize) console.log(`    Size:       ${r.fileSize}`);
    if (r.fileSaved) console.log(`    File:       ${r.fileSaved}`);
    if (r.failedStep) console.log(`    Failed at:  ${r.failedStep}`);
    if (r.error) console.log(`    Error:      ${r.error.slice(0, 150)}`);
    console.log(`    T1 lines:   ${JSON.stringify(r.t1Lines)}`);
    console.log(`    T2 lines:   ${JSON.stringify(r.t2Lines)}`);
    console.log(`    Zone fill:  ${(r.zoneOccupancy * 100).toFixed(0)}%`);
    console.log(`    Font sizes: T1=${r.t1FontSize}px T2=${r.t2FontSize}px`);
    if (r.renderedLayout) {
      console.log(`    Final zone: ${r.renderedLayout.finalZone} (rendered)`);
      console.log(`    Layout:     vCenter=${(r.renderedLayout.verticalCenterNorm * 100).toFixed(0)}% hCenter=${(r.renderedLayout.horizontalCenterNorm * 100).toFixed(0)}% height=${r.renderedLayout.textBlockHeight}px`);
    } else if (r.selectedZone) {
      console.log(`    Zone:       ${r.selectedZone} (content-aware)`);
    }
  }

  // ── Carousel-Level Consistency Evaluation ──────────────────────
  console.log(`\n\n${'═'.repeat(64)}`);
  console.log('CAROUSEL-LEVEL EVALUATION');
  console.log(`${'═'.repeat(64)}`);

  const rendered = reports.filter(r => r.status === 'APPROVED');
  const approved = reports.filter(r => r.status === 'APPROVED');
  const visualMissing = reports.filter(r => r.status === 'VISUAL_MISSING');
  const failed = reports.filter(r => r.status === 'FAILED_PROVIDER');
  const blocked = reports.filter(r => r.status === 'BLOCKED');

  // Typography consistency (from normalization pass)
  const typographyConsistent = typoResult.mode === 'SHARED_T1_SIZE';
  console.log(`\n  Typography: ${typoResult.mode}`);
  if (typoResult.sharedT1Size) console.log(`    Shared T1: ${typoResult.sharedT1Size}px`);
  if (typoResult.sharedT2Size) console.log(`    Shared T2: ${typoResult.sharedT2Size}px`);

  const t1Sizes = new Set(rendered.map(r => r.t1FontSize));
  const t2Sizes = new Set(rendered.map(r => r.t2FontSize));
  console.log(`    Rendered T1: ${[...t1Sizes].join(', ')}px — ${t1Sizes.size <= 1 ? 'CONSISTENT' : 'INCONSISTENT'}`);
  console.log(`    Rendered T2: ${[...t2Sizes].join(', ')}px — ${t2Sizes.size <= 1 ? 'CONSISTENT' : 'INCONSISTENT'}`);

  // Visual consistency
  const sources = new Set(rendered.map(r => r.imageSource));
  const allSameSource = sources.size <= 1;
  console.log(`\n  Visual sources: ${[...sources].join(', ')} — ${allSameSource ? 'UNIFORM' : 'MIXED'}`);

  // Provider session summary
  if (session) {
    const summary = session.getSummary();
    console.log(`  Provider lock: ${summary.lockedProvider ?? 'none'}`);
    console.log(`  Restarted:     ${summary.wasRestarted ? `YES — ${summary.restartReason?.slice(0, 100)}` : 'no'}`);
  }

  // ── Perceptual Consistency (from FINAL rendered layouts) ────────
  const slidesWithLayout = rendered
    .filter(r => r.renderedLayout)
    .map(r => ({ id: r.id, layout: r.renderedLayout! }));

  let perceptualConsistent = true;
  let perceptualScore = 100;
  const outOfFamily: string[] = [];

  if (slidesWithLayout.length > 0) {
    const perceptual = evaluatePerceptualConsistency(slidesWithLayout);
    perceptualConsistent = perceptual.consistent;
    perceptualScore = perceptual.score;

    console.log(`\n  Perceptual consistency: ${perceptual.consistent ? 'PASS' : 'FAIL'} (score: ${perceptual.score}/100)`);

    const dims = perceptual.dimensions;
    console.log(`    ${dims.zoneConsistency.pass ? '✓' : '✗'} Zone consistency:     ${dims.zoneConsistency.score}/25 — ${dims.zoneConsistency.detail}`);
    console.log(`    ${dims.verticalAlignment.pass ? '✓' : '✗'} Vertical alignment:   ${dims.verticalAlignment.score}/25 — ${dims.verticalAlignment.detail}`);
    console.log(`    ${dims.horizontalAlignment.pass ? '✓' : '✗'} Horizontal alignment: ${dims.horizontalAlignment.score}/25 — ${dims.horizontalAlignment.detail}`);
    console.log(`    ${dims.textBlockWeight.pass ? '✓' : '✗'} Text block weight:    ${dims.textBlockWeight.score}/25 — ${dims.textBlockWeight.detail}`);

    outOfFamily.push(...perceptual.outOfFamily);
  } else {
    console.log(`\n  Perceptual consistency: N/A (no rendered layouts)`);
  }

  // Typography out-of-family
  for (const r of rendered) {
    if (t1Sizes.size > 1 && r.t1FontSize !== [...t1Sizes][0]) outOfFamily.push(`${r.id} (T1 font differs)`);
    if (t2Sizes.size > 1 && r.t2FontSize !== [...t2Sizes][0]) outOfFamily.push(`${r.id} (T2 font differs)`);
  }

  console.log(`\n  Out-of-family slides:`);
  if (outOfFamily.length === 0) {
    console.log(`    None — all rendered slides feel part of the same set`);
  } else {
    for (const note of outOfFamily) {
      console.log(`    ⚠ ${note}`);
    }
  }

  // ── Final Summary ──────────────────────────────────────────────
  console.log(`\n\n${'═'.repeat(64)}`);
  console.log('FINAL SUMMARY');
  console.log(`${'═'.repeat(64)}`);
  console.log(`  Total slides:    ${reports.length}`);
  console.log(`  APPROVED:        ${approved.length}`);
  console.log(`  VISUAL_MISSING:  ${visualMissing.length}`);
  console.log(`  FAILED_PROVIDER: ${failed.length}`);
  console.log(`  BLOCKED:         ${blocked.length}`);
  console.log(`  Duration:        ${totalDuration}s`);
  console.log(`  Timeouts:        per-slide ${PER_SLIDE_TIMEOUT_MS / 1000}s, global ${GLOBAL_TIMEOUT_MS / 1000}s`);
  console.log(`  Output:          ${outputDir}`);

  // Completion status
  type CompletionStatus = 'COMPLETE' | 'PARTIAL' | 'FAILED';
  let completion: CompletionStatus;
  if (approved.length === reports.length) {
    completion = 'COMPLETE';
  } else if (approved.length > 0) {
    completion = 'PARTIAL';
  } else {
    completion = 'FAILED';
  }
  console.log(`\n  Completion: ${completion} (${approved.length}/${reports.length} slides approved)`);

  // Production verdict (only possible if COMPLETE)
  const noOutliers = outOfFamily.length === 0;
  const productionReady =
    completion === 'COMPLETE' &&
    typographyConsistent &&
    perceptualConsistent &&
    noOutliers;

  console.log(`\n  ${'─'.repeat(40)}`);
  if (productionReady) {
    console.log(`  VERDICT: PRODUCTION-READY for single-carousel rendering`);
  } else {
    console.log(`  VERDICT: NOT YET production-ready`);
    if (completion !== 'COMPLETE') console.log(`    - ${completion}: ${reports.length - approved.length} slide(s) not approved`);
    if (failed.length > 0) console.log(`    - ${failed.length} FAILED_PROVIDER (provider unavailable or timeout)`);
    if (visualMissing.length > 0) console.log(`    - ${visualMissing.length} VISUAL_MISSING (no real subject)`);
    if (!typographyConsistent) console.log(`    - Typography inconsistency`);
    if (!perceptualConsistent) console.log(`    - Perceptual consistency failed (score: ${perceptualScore}/100)`);
    if (!noOutliers) console.log(`    - Out-of-family slides detected`);
  }
  console.log();
}

main().catch(err => {
  console.error('Carousel render failed:', err);
  process.exit(1);
});
