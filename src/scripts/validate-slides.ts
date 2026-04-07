/**
 * Slide Render Validation — Test Script
 *
 * Validates 3 test slides through the text-fit validator and
 * documentary-style renderer. Produces validation reports and
 * rendered PNGs for approved slides.
 *
 * Usage:
 *   npx tsx src/scripts/validate-slides.ts
 *
 * Output:
 *   output/slides/slide-1-flamingos.png
 *   output/slides/slide-2-bananas.png
 *   output/slides/slide-3-octopus.png
 */

import { renderAndSaveFactSlide, type FactSlideInput, type RenderStep } from '../lib/visual/fact-slide-renderer';

// ─── Test Slide Definitions ─────────────────────────────────────

const TEST_SLIDES: FactSlideInput[] = [
  // ── Slide 1: Flamingos ──────────────────────────────────────────
  {
    slideType: 'fact',
    displayTitle: 'A group of flamingos is called a flamboyance',
    displaySupport: 'The name matches the spectacle.',
    textZone: 'right',
    keepTogether: ['called a flamboyance'],
    slideRole: 'FACT',
    imagePrompt: [
      'CORE SCENE: An overhead shot looking straight down at a tight cluster of 15-20 flamingos standing in shallow turquoise water.',
      'Their vivid pink bodies form a dense, irregular organic cluster against the blue-green water.',
      'COMPOSITION: Flamingo cluster positioned in the left two-thirds of the frame.',
      'The right third is open shallow water with pale sand faintly visible beneath.',
      'Camera is directly above.',
      'VISUAL PRIORITY: The saturated pink cluster against the desaturated turquoise water.',
      'STYLE: Photorealistic, documentary-style aerial photography. Natural daylight, clear shallow water.',
      'NEGATIVE PROMPT: No text, no watermarks, no labels, no artistic filters, no oversaturation, no surreal elements.',
    ].join(' '),
  },

  // ── Slide 2: Bananas / Strawberries ─────────────────────────────
  {
    slideType: 'fact',
    displayTitle: 'Bananas are berries, strawberries are not',
    displaySupport: 'The seeds tell the real story.',
    textZone: 'right',
    keepTogether: ['strawberries are not'],
    slideRole: 'FACT',
    imagePrompt: [
      'CORE SCENE: A banana sliced cleanly in half lengthwise and a strawberry sliced cleanly in half,',
      'both resting cut-side-up on a plain light marble surface.',
      'The banana interior shows small dark seeds embedded in the pale flesh.',
      'The strawberry interior shows seeds visible on the outer skin.',
      'COMPOSITION: Both halves placed in the left two-thirds of the frame, banana above, strawberry below.',
      'The right third is clean marble surface for text overlay. Shot from directly above, flat-lay style.',
      'VISUAL PRIORITY: The contrast between the banana internal seeds and the strawberry external seeds.',
      'STYLE: Photorealistic, documentary-style flat-lay photography. Soft natural daylight from one side.',
      'NEGATIVE PROMPT: No text, no watermarks, no labels, no infographic elements, no artistic filters.',
    ].join(' '),
  },

  // ── Slide 3: Octopus ───────────────────────────────────────────
  {
    slideType: 'fact',
    displayTitle: 'Octopuses have three hearts',
    displaySupport: 'Three pulses. One animal.',
    textZone: 'right',
    keepTogether: ['three hearts', 'three pulses'],
    slideRole: 'FACT',
    imagePrompt: [
      'CORE SCENE: A single live octopus resting on pale sand in calm, shallow, clear water.',
      'Three concentric ripple rings radiate outward from its body across the water surface.',
      'The innermost ring is tight and well-defined. The second ring is slightly wider and softer.',
      'The third ring is the most spread out, faintly broken along one section where it is beginning to dissipate.',
      'The spacing between rings is slightly uneven. The water surface has a faint natural grain.',
      'COMPOSITION: Octopus positioned in the left third of the frame, origin point of the three rings.',
      'The ripples expand rightward across the remaining two-thirds.',
      'Space between and beyond the rings provides clean textured area for text overlay. Shot from directly above.',
      'VISUAL PRIORITY: The three crisp circular ripple lines against the flat still water.',
      'The innermost ring is the brightest and sharpest. The second slightly dimmer. The third faintest but countable.',
      'STYLE: Photorealistic, documentary-style overhead shallow-water photography.',
      'Natural sunlight, slightly diffused. Real-world water surface with faint ambient micro-texture.',
      'NEGATIVE PROMPT: No text, no watermarks, no labels, no diagrams, no perfectly uniform ripple spacing,',
      'no mirror-smooth water, no artificial symmetry, no glow, no bioluminescence, no visual effects.',
    ].join(' '),
  },
];

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  SLIDE RENDER VALIDATION — 3 TEST CASES         ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const slideNames = ['slide-1-flamingos', 'slide-2-bananas', 'slide-3-octopus'];
  const results: Array<{
    name: string;
    approved: boolean;
    failedStep?: RenderStep;
    error?: string;
    blocked?: boolean;
    unhandled?: boolean;
  }> = [];

  // ── Per-slide isolation: each slide runs independently ──────────
  for (let i = 0; i < TEST_SLIDES.length; i++) {
    const slide = TEST_SLIDES[i];
    const name = slideNames[i];

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`SLIDE ${i + 1}: ${name}`);
    console.log(`${'─'.repeat(50)}`);
    console.log(`  Title: "${slide.displayTitle}"`);
    console.log(`  Support: "${slide.displaySupport ?? '(none)'}"`);
    console.log(`  Zone: ${slide.textZone}`);
    console.log(`  Keep Together: [${(slide.keepTogether ?? []).join(', ')}]`);

    try {
      const outputPath = `output/slides/${name}.png`;

      const renderResult = await renderAndSaveFactSlide(
        slide,
        outputPath,
        undefined, // no Gemini — uses fallback
      );

      if (renderResult.failedStep) {
        console.error(`\n  FAILED at step: ${renderResult.failedStep}`);
        console.error(`  Error: ${renderResult.error}`);
        results.push({
          name,
          approved: false,
          failedStep: renderResult.failedStep,
          error: renderResult.error,
        });
      } else if (renderResult.approved && renderResult.savedTo) {
        console.log(`  Saved: ${renderResult.savedTo}`);
        results.push({ name, approved: true });
      } else {
        // Validation blocked (not an error — text didn't fit)
        results.push({ name, approved: false, blocked: true });
      }
    } catch (err) {
      // Catch-all: something completely unexpected
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n  UNHANDLED ERROR on ${name}: ${msg}`);
      results.push({ name, approved: false, error: msg, unhandled: true });
      // Continue to next slide — do NOT abort the run
    }
  }

  // ── Summary ─────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`);
  console.log('SUMMARY');
  console.log(`${'═'.repeat(50)}`);

  for (const r of results) {
    if (r.approved) {
      console.log(`  APPROVED   ${r.name}`);
    } else if (r.failedStep) {
      console.log(`  ERROR      ${r.name}  [step: ${r.failedStep}] ${r.error ?? ''}`);
    } else if (r.unhandled) {
      console.log(`  CRASHED    ${r.name}  ${r.error ?? ''}`);
    } else {
      console.log(`  BLOCKED    ${r.name}`);
    }
  }

  const approvedCount = results.filter(r => r.approved).length;
  const errorCount = results.filter(r => r.failedStep || r.unhandled).length;
  console.log(`\n  ${approvedCount}/${results.length} approved, ${errorCount} errors`);
}

main().catch(console.error);
