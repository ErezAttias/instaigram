/**
 * Validate style lock — render 2 OPENER slides via Gemini with style lock active.
 *
 * Usage: npx tsx scripts/validate-style-lock.ts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import path from 'path';
import { renderAndSaveOpenerSlide } from '../src/lib/visual/renderer';
import { getUnifiedImageProvider } from '../src/lib/ai/image-provider';

const slides = [
  {
    name: 'stylelock-1-tech',
    input: {
      slideRole: 'HOOK',
      displayTitle: 'AI will never replace you',
      displaySupport: 'But someone using AI will.',
      subject: 'a software engineer in a dark server room, reaching toward a rack of blinking machines, cables hanging around them',
      topic: 'tech',
    },
  },
  {
    name: 'stylelock-2-psychology',
    input: {
      slideRole: 'HOOK',
      displayTitle: 'The hidden bias destroying your decisions',
      displaySupport: 'You trust your gut. Your gut is lying.',
      subject: 'a person pressing their forehead against a rain-streaked window at night, their distorted reflection staring back',
      topic: 'psychology',
    },
  },
];

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Style Lock Validation — 2 grounded OPENERS    ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const imageProvider = getUnifiedImageProvider();

  for (const { name, input } of slides) {
    console.log(`\n${'━'.repeat(60)}`);
    console.log(`Rendering: ${name}`);
    console.log(`  Title:   ${input.displayTitle}`);
    console.log(`  Subject: ${input.subject.slice(0, 80)}...`);

    const outputPath = path.resolve(__dirname, '..', 'output', `${name}.png`);

    try {
      const result = await renderAndSaveOpenerSlide(input, outputPath, imageProvider);

      console.log(`\n  Result:`);
      console.log(`    Source:  ${result.imageSource} (${result.imageModel})`);
      console.log(`    Size:    ${(result.image.length / 1024).toFixed(0)}KB`);
      console.log(`    Saved:   ${result.savedTo}`);
      console.log(`    Topic:   ${result.promptOutput.meta.topic}`);
      console.log(`    Tension: ${result.promptOutput.meta.tensionType}`);
      console.log(`\n  Intent (style-locked):`);
      console.log(`    Scene: ${result.promptOutput.intent.scene.slice(0, 150)}...`);
      console.log(`    Hook:  ${result.promptOutput.intent.visualHook.slice(0, 150)}...`);
    } catch (err) {
      console.error(`  FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n${'━'.repeat(60)}`);
  console.log('Done. Compare output/stylelock-*.png vs output/intent-*.png');
}

main().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
