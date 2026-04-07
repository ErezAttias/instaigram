/**
 * Validate visual intent improvement — render 2 OPENER slides via Gemini.
 *
 * Usage: npx tsx scripts/validate-intent.ts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import path from 'path';
import { renderAndSaveOpenerSlide } from '../src/lib/visual/renderer';
import { getUnifiedImageProvider } from '../src/lib/ai/image-provider';

const slides = [
  {
    name: 'intent-1-threat',
    input: {
      slideRole: 'HOOK',
      displayTitle: 'AI will never replace you',
      displaySupport: 'But someone using AI will.',
      subject: 'a software engineer frozen mid-motion as code fragments shatter around them like breaking glass, dark server room',
      topic: 'tech',
    },
  },
  {
    name: 'intent-2-revelation',
    input: {
      slideRole: 'HOOK',
      displayTitle: 'The hidden satisfactionbias destroying your decisions',
      displaySupport: 'You trust your gut. Your gut is lying.',
      subject: 'a human face with one half normal and one half transparent revealing neural circuitry and glowing synapses beneath the skin',
      topic: 'psychology',
    },
  },
];

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Visual Intent Validation — 2 OPENER slides ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const imageProvider = getUnifiedImageProvider();

  for (const { name, input } of slides) {
    console.log(`\n${'━'.repeat(60)}`);
    console.log(`Rendering: ${name}`);
    console.log(`  Title:   ${input.displayTitle}`);
    console.log(`  Subject: ${input.subject.slice(0, 80)}...`);
    console.log(`  Topic:   ${input.topic}`);

    const outputPath = path.resolve(__dirname, '..', 'output', `${name}.png`);

    try {
      const result = await renderAndSaveOpenerSlide(input, outputPath, imageProvider);

      console.log(`\n  Result:`);
      console.log(`    Source:  ${result.imageSource} (${result.imageModel})`);
      console.log(`    Size:    ${(result.image.length / 1024).toFixed(0)}KB`);
      console.log(`    Saved:   ${result.savedTo}`);
      console.log(`    Topic:   ${result.promptOutput.meta.topic}`);
      console.log(`    Tension: ${result.promptOutput.meta.tensionType}`);
      console.log(`    Intent scene: ${result.promptOutput.intent.scene.slice(0, 120)}...`);
      console.log(`    Intent hook:  ${result.promptOutput.intent.visualHook.slice(0, 120)}...`);
    } catch (err) {
      console.error(`  FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n${'━'.repeat(60)}`);
  console.log('Done. Check output/ directory for rendered images.');
}

main().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
