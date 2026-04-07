/**
 * Test script: Render a single OPENER slide
 *
 * Usage:
 *   npx tsx scripts/render-opener.ts                # Fallback background (no API call)
 *   npx tsx scripts/render-opener.ts --gemini       # Gemini generated background
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import path from 'path';
import { renderAndSaveOpenerSlide } from '../src/lib/visual/renderer';
import { getUnifiedImageProvider, type ImageGenerator } from '../src/lib/ai/image-provider';

const USE_GEMINI = process.argv.includes('--gemini');

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   OPENER Slide Renderer — Test Run   ║');
  console.log('╚══════════════════════════════════════╝\n');

  const input = {
    slideRole: 'HOOK',
    displayTitle: 'AI will never replace you',
    displaySupport: 'But someone using AI will.',
    subject: 'a software engineer staring at a glowing screen in a dark room, wearing a dark hoodie, side profile',
  };

  console.log(`Input:`);
  console.log(`  Role:    ${input.slideRole}`);
  console.log(`  Title:   ${input.displayTitle}`);
  console.log(`  Support: ${input.displaySupport}`);
  console.log(`  Subject: ${input.subject}`);
  console.log(`  Mode:    ${USE_GEMINI ? 'Gemini' : 'Fallback gradient'}\n`);

  let imageProvider: ImageGenerator | undefined;

  if (USE_GEMINI) {
    const unified = getUnifiedImageProvider();
    imageProvider = unified;
    const model = unified.resolveModel(input.slideRole);
    console.log(`[Config] Unified image provider (primary: Gemini)`);
    console.log(`[Config] Model for ${input.slideRole}: ${model}\n`);
  }

  const outputPath = path.resolve(__dirname, '..', 'output', 'opener-test.png');

  const result = await renderAndSaveOpenerSlide(input, outputPath, imageProvider);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`RESULT:`);
  console.log(`  Image source: ${result.imageSource}`);
  if (result.imageModel) console.log(`  Image model:  ${result.imageModel}`);
  console.log(`  Template:     ${result.promptOutput.template.name}`);
  console.log(`  Image size:   ${(result.image.length / 1024).toFixed(0)}KB`);
  console.log(`  Saved to:     ${result.savedTo}`);
  console.log(`\nImage prompt:`);
  console.log(`  ${result.promptOutput.imagePrompt.slice(0, 200)}...`);

  if (result.promptOutput.emphasisAnalysis) {
    console.log(`\nEmphasis analysis:`);
    result.promptOutput.emphasisAnalysis.segments.forEach(seg => {
      const marker = seg.isEmphasis ? '★' : ' ';
      console.log(`  ${marker} "${seg.text}"`);
    });
  }

  console.log(`\nLayout zones:`);
  result.promptOutput.layout.forEach(zone => {
    console.log(`  [${zone.zone}] @ (${zone.position.x}, ${zone.position.y}) — ${zone.alignment} — ${zone.typography}`);
    if (zone.lines) console.log(`    Lines: ${JSON.stringify(zone.lines)}`);
  });

  // Show model routing table
  console.log(`\nModel routing:`);
  if (imageProvider) {
    for (const role of ['HOOK', 'OPENER', 'CTA', 'FACT', 'IMPLICATION', 'BUILD', 'SETUP', 'INSIGHT']) {
      console.log(`  ${role.padEnd(14)} → ${imageProvider.resolveModel(role)}`);
    }
  }
}

main().catch(err => {
  console.error('Render failed:', err);
  process.exit(1);
});
