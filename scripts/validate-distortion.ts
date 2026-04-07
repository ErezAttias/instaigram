/**
 * Validate distortion engine — render 2 OPENER slides via Gemini.
 *
 * Usage: npx tsx scripts/validate-distortion.ts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import path from 'path';
import { renderAndSaveOpenerSlide } from '../src/lib/visual/renderer';
import { getUnifiedImageProvider } from '../src/lib/ai/image-provider';

const slides = [
  {
    name: 'distortion-1-tech',
    input: {
      slideRole: 'HOOK',
      displayTitle: 'AI will never replace you',
      displaySupport: 'But someone using AI will.',
      subject: 'a software engineer standing in a dark server room corridor, reaching toward a rack of blinking machines, cables hanging around them',
      topic: 'tech',
    },
  },
  {
    name: 'distortion-2-psychology',
    input: {
      slideRole: 'HOOK',
      displayTitle: 'The hidden bias destroying your decisions',
      displaySupport: 'You trust your gut. Your gut is lying.',
      subject: 'a person pressing their forehead against a rain-streaked window at night, warm lamp behind them, their distorted reflection visible',
      topic: 'psychology',
    },
  },
];

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Distortion Validation — 2 OPENERS w/ tension  ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const imageProvider = getUnifiedImageProvider();

  for (const { name, input } of slides) {
    console.log(`\n${'━'.repeat(60)}`);
    console.log(`Rendering: ${name}`);
    console.log(`  Title:   ${input.displayTitle}`);

    const outputPath = path.resolve(__dirname, '..', 'output', `${name}.png`);

    try {
      const result = await renderAndSaveOpenerSlide(input, outputPath, imageProvider);

      console.log(`\n  Result:`);
      console.log(`    Source:     ${result.imageSource} (${result.imageModel})`);
      console.log(`    Size:       ${(result.image.length / 1024).toFixed(0)}KB`);
      console.log(`    Saved:      ${result.savedTo}`);
      console.log(`    Distortion: ${result.promptOutput.distortion.type}`);
      console.log(`    Injection:  ${result.promptOutput.distortion.sceneInjection.slice(0, 120)}...`);
      console.log(`    Rationale:  ${result.promptOutput.distortion.rationale}`);
    } catch (err) {
      console.error(`  FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n${'━'.repeat(60)}`);
  console.log('Done. Compare output/distortion-*.png vs output/stylelock-*.png');
}

main().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
