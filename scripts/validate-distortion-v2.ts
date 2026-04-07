/**
 * Validate upgraded distortion — render 2 OPENER slides where
 * distortion is the PRIMARY FOCAL POINT.
 *
 * Usage: npx tsx scripts/validate-distortion-v2.ts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import path from 'path';
import { renderAndSaveOpenerSlide } from '../src/lib/visual/renderer';
import { getUnifiedImageProvider } from '../src/lib/ai/image-provider';

const slides = [
  {
    name: 'distortion-v2-1-tech',
    input: {
      slideRole: 'HOOK',
      displayTitle: 'AI will never replace you',
      displaySupport: 'But someone using AI will.',
      subject: 'a software engineer in a dark server room holding a printed page up to their face, reading it intently, lit by the amber glow of server rack LEDs',
      topic: 'tech',
    },
  },
  {
    name: 'distortion-v2-2-psychology',
    input: {
      slideRole: 'HOOK',
      displayTitle: 'The hidden bias destroying your decisions',
      displaySupport: 'You trust your gut. Your gut is lying.',
      subject: 'a person standing at a dark window at night with their reflection clearly visible in the glass, warm lamp behind them, shot from the side showing both face and reflection',
      topic: 'psychology',
    },
  },
];

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Distortion v2 — PRIMARY FOCAL POINT validation    ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const imageProvider = getUnifiedImageProvider();

  for (const { name, input } of slides) {
    console.log(`\n${'━'.repeat(60)}`);
    console.log(`Rendering: ${name}`);
    console.log(`  Title: ${input.displayTitle}`);

    const outputPath = path.resolve(__dirname, '..', 'output', `${name}.png`);

    try {
      const result = await renderAndSaveOpenerSlide(input, outputPath, imageProvider);

      console.log(`\n  Result:`);
      console.log(`    Source:      ${result.imageSource} (${result.imageModel})`);
      console.log(`    Size:        ${(result.image.length / 1024).toFixed(0)}KB`);
      console.log(`    Distortion:  ${result.promptOutput.distortion.type}`);
      console.log(`    Intensity:   ${result.promptOutput.distortion.rationale}`);
      console.log(`    Injection:   ${result.promptOutput.distortion.sceneInjection.slice(0, 150)}...`);
      console.log(`    Composition: ${result.promptOutput.distortion.compositionDirective.slice(0, 120)}...`);
      console.log(`    Saved:       ${result.savedTo}`);
    } catch (err) {
      console.error(`  FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n${'━'.repeat(60)}`);
  console.log('Done. Compare distortion-v2-*.png vs distortion-*.png');
}

main().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
