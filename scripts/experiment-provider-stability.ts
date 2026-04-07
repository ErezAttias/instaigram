/**
 * Provider Stability Experiment
 *
 * Tests whether Gemini failures are caused by burst rate or true instability.
 *
 * Experiment A: Sequential with 2s gap between slides
 * Experiment B: Sequential with no gap (current mode)
 *
 * Each experiment generates 3 images (one per fact) and reports success/failure.
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getUnifiedImageProvider } from '../src/lib/ai/image-provider';

const provider = getUnifiedImageProvider();

const SLIDES = [
  {
    id: 'flamingos',
    prompt: 'CORE SCENE: An overhead shot looking straight down at a tight cluster of 15-20 flamingos standing in shallow turquoise water. Their vivid pink bodies form a dense, irregular organic cluster against the blue-green water. COMPOSITION: Flamingo cluster positioned in the left two-thirds of the frame. The right third is open shallow water with pale sand faintly visible beneath. Camera is directly above. VISUAL PRIORITY: The saturated pink cluster against the desaturated turquoise water. STYLE: Photorealistic, documentary-style aerial photography. Natural daylight, clear shallow water. NEGATIVE PROMPT: No text, no watermarks, no labels, no artistic filters, no oversaturation, no surreal elements.',
  },
  {
    id: 'bananas',
    prompt: 'CORE SCENE: A banana sliced cleanly in half lengthwise and a strawberry sliced cleanly in half, both resting cut-side-up on a plain light marble surface. The banana interior shows small dark seeds embedded in the pale flesh. The strawberry interior shows seeds visible on the outer skin. COMPOSITION: Both halves placed in the left two-thirds of the frame, banana above, strawberry below. The right third is clean marble surface for text overlay. Shot from directly above, flat-lay style. VISUAL PRIORITY: The contrast between the banana internal seeds and the strawberry external seeds. STYLE: Photorealistic, documentary-style flat-lay photography. Soft natural daylight from one side. NEGATIVE PROMPT: No text, no watermarks, no labels, no infographic elements, no artistic filters.',
  },
  {
    id: 'octopus',
    prompt: 'CORE SCENE: A single live octopus resting on pale sand in calm, shallow, clear water. Three concentric ripple rings radiate outward from its body across the water surface. COMPOSITION: Octopus positioned in the left third of the frame, origin point of the three rings. The ripples expand rightward across the remaining two-thirds. Shot from directly above. VISUAL PRIORITY: The three crisp circular ripple lines against the flat still water. STYLE: Photorealistic, documentary-style overhead shallow-water photography. Natural sunlight, slightly diffused. NEGATIVE PROMPT: No text, no watermarks, no labels, no diagrams, no perfectly uniform ripple spacing, no mirror-smooth water.',
  },
];

interface SlideResult {
  id: string;
  success: boolean;
  durationMs: number;
  error?: string;
  httpStatus?: string;
  imageSize?: string;
}

async function generateOne(slide: typeof SLIDES[0]): Promise<SlideResult> {
  const start = Date.now();
  try {
    const result = await provider.generateImage(slide.prompt, {
      width: 1080,
      height: 1350,
      slideRole: 'FACT',
    });
    const dur = Date.now() - start;
    const size = `${Math.round(result.data.length / 1024)}KB`;
    return { id: slide.id, success: true, durationMs: dur, imageSize: size };
  } catch (err) {
    const dur = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    // Extract HTTP status from error message
    const statusMatch = msg.match(/HTTP (\d+)/);
    return {
      id: slide.id,
      success: false,
      durationMs: dur,
      error: msg.slice(0, 200),
      httpStatus: statusMatch?.[1],
    };
  }
}

function printResults(label: string, results: SlideResult[]) {
  console.log(`\n  ${label}:`);
  console.log(`  ${'─'.repeat(56)}`);
  for (const r of results) {
    const status = r.success ? '✓ OK' : '✗ FAIL';
    const dur = `${(r.durationMs / 1000).toFixed(1)}s`;
    if (r.success) {
      console.log(`    ${status}  ${r.id.padEnd(12)} ${dur.padStart(7)}  ${r.imageSize}`);
    } else {
      console.log(`    ${status}  ${r.id.padEnd(12)} ${dur.padStart(7)}  HTTP ${r.httpStatus ?? '?'}`);
      console.log(`          ${r.error?.slice(0, 120)}`);
    }
  }
  const succeeded = results.filter(r => r.success).length;
  console.log(`  Result: ${succeeded}/${results.length} succeeded`);
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  PROVIDER STABILITY EXPERIMENT                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Model: ${provider.resolveModel('FACT')}`);
  console.log(`  Slides: ${SLIDES.length}`);
  console.log();

  // ── EXPERIMENT A: Sequential with 2s gap ──────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('EXPERIMENT A — SEQUENTIAL (2s gap between slides)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const resultsA: SlideResult[] = [];
  for (let i = 0; i < SLIDES.length; i++) {
    if (i > 0) {
      console.log(`  ... waiting 2s before slide ${i + 1} ...`);
      await new Promise(r => setTimeout(r, 2000));
    }
    console.log(`  Generating: ${SLIDES[i].id}`);
    const result = await generateOne(SLIDES[i]);
    resultsA.push(result);
    console.log(`  → ${result.success ? 'OK' : 'FAIL'} (${(result.durationMs / 1000).toFixed(1)}s)`);
  }

  printResults('Experiment A results', resultsA);

  // ── Wait 5s between experiments ────────────────────────────────
  console.log('\n  ... waiting 5s between experiments ...\n');
  await new Promise(r => setTimeout(r, 5000));

  // ── EXPERIMENT B: Sequential no gap (current mode) ────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('EXPERIMENT B — SEQUENTIAL (no gap, current mode)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const resultsB: SlideResult[] = [];
  for (const slide of SLIDES) {
    console.log(`  Generating: ${slide.id}`);
    const result = await generateOne(slide);
    resultsB.push(result);
    console.log(`  → ${result.success ? 'OK' : 'FAIL'} (${(result.durationMs / 1000).toFixed(1)}s)`);
  }

  printResults('Experiment B results', resultsB);

  // ── CONCLUSION ────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log('CONCLUSION');
  console.log(`${'═'.repeat(60)}`);

  const aSuccess = resultsA.filter(r => r.success).length;
  const bSuccess = resultsB.filter(r => r.success).length;
  const aFail = resultsA.filter(r => !r.success).length;
  const bFail = resultsB.filter(r => !r.success).length;

  console.log(`  Experiment A (2s gap):  ${aSuccess}/${SLIDES.length} OK, ${aFail} failed`);
  console.log(`  Experiment B (no gap):  ${bSuccess}/${SLIDES.length} OK, ${bFail} failed`);

  if (aSuccess === SLIDES.length && bSuccess < SLIDES.length) {
    console.log(`\n  DIAGNOSIS: CONCURRENCY_LIMIT_ISSUE`);
    console.log(`  The gap between requests matters. Provider throttles burst requests.`);
  } else if (aSuccess < SLIDES.length && bSuccess < SLIDES.length) {
    console.log(`\n  DIAGNOSIS: PROVIDER_INSTABILITY`);
    console.log(`  Both modes fail. Provider is unstable regardless of pacing.`);
  } else if (aSuccess === SLIDES.length && bSuccess === SLIDES.length) {
    console.log(`\n  DIAGNOSIS: PROVIDER_STABLE`);
    console.log(`  Both modes succeed. No burst rate or instability issue detected.`);
  } else {
    console.log(`\n  DIAGNOSIS: INCONCLUSIVE`);
    console.log(`  Mixed results. More data needed.`);
  }

  // Collect error patterns
  const allErrors = [...resultsA, ...resultsB].filter(r => !r.success);
  if (allErrors.length > 0) {
    const statusCounts: Record<string, number> = {};
    for (const e of allErrors) {
      const key = e.httpStatus ?? 'unknown';
      statusCounts[key] = (statusCounts[key] ?? 0) + 1;
    }
    console.log(`\n  Error breakdown:`);
    for (const [status, count] of Object.entries(statusCounts)) {
      console.log(`    HTTP ${status}: ${count} occurrence(s)`);
    }
  }
  console.log();
}

main().catch(err => {
  console.error('Experiment failed:', err);
  process.exit(1);
});
