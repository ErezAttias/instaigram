/**
 * End-to-end test for the EXPAND step in the carousel pipeline.
 * Runs 3 topics through the full pipeline and logs outputs at each stage.
 *
 * Usage: npx tsx scripts/test-expand-pipeline.ts
 */

import { config } from 'dotenv';
import { resolve as pathResolve } from 'path';
config({ path: pathResolve(__dirname, '..', '.env.local') });

// Register path aliases
import { register } from 'tsconfig-paths';
import { resolve } from 'path';

const tsconfig = require(resolve(__dirname, '..', 'tsconfig.json'));
register({
  baseUrl: resolve(__dirname, '..'),
  paths: tsconfig.compilerOptions.paths,
});

// Force real OpenAI provider
process.env.AI_PROVIDER = 'openai';
delete process.env.USE_MOCK_PROVIDER;

import { generateCarousel } from '@/lib/pipeline/carousel-pipeline';
import { getAIProvider } from '@/lib/ai/provider';

const TOPICS = [
  {
    topic: 'animal facts',
    hook: { text: 'Octopuses have three hearts and blue blood', type: 'HIDDEN_TRUTH' },
  },
  {
    topic: 'strange historical facts',
    hook: { text: 'Napoleon was once attacked by a horde of rabbits', type: 'HIDDEN_TRUTH' },
  },
  {
    topic: 'science facts',
    hook: { text: 'A teaspoon of neutron star weighs 6 billion tons', type: 'HIDDEN_TRUTH' },
  },
];

function divider(title: string) {
  console.log('\n' + '═'.repeat(70));
  console.log(`  ${title}`);
  console.log('═'.repeat(70));
}

function subDivider(title: string) {
  console.log('\n' + '─'.repeat(50));
  console.log(`  ${title}`);
  console.log('─'.repeat(50));
}

async function runTest() {
  const ai = getAIProvider();
  console.log(`Provider: ${ai.providerName} / ${ai.modelName}\n`);

  for (const { topic, hook } of TOPICS) {
    divider(`TOPIC: "${topic}" | HOOK: "${hook.text}"`);

    try {
      const result = await generateCarousel({ topic, hook }, ai);

      // ── Selected Facts (raw from MINE → SELECT) ──
      subDivider('SELECTED FACTS (raw claim + evidence)');
      for (const [i, fact] of result.selectedFacts.entries()) {
        console.log(`\n  Fact ${i + 1}:`);
        console.log(`    claim:    ${fact.claim}`);
        console.log(`    evidence: ${fact.evidence}`);
        console.log(`    entities: [${fact.entities.join(', ')}]`);
      }

      // ── Expanded Facts ──
      subDivider('EXPANDED FACTS (after EXPAND step)');
      for (const [i, fact] of result.expandedFacts.entries()) {
        console.log(`\n  Fact ${i + 1}:`);
        console.log(`    claim:     ${fact.claim}`);
        console.log(`    expansion: ${fact.expansion}`);
        console.log(`    length:    ${fact.expansion.length} chars`);
      }

      // ── Final Composed Slides ──
      subDivider('FINAL COMPOSED SLIDES');
      for (const slide of result.carousel.slides) {
        const roleTag = slide.role.padEnd(11);
        console.log(`\n  [${slide.slideNumber}] ${roleTag} headline: ${slide.headline}`);
        console.log(`     ${''.padEnd(11)} body:     ${slide.body}`);
        console.log(`     ${''.padEnd(11)} body len: ${slide.body.length} chars`);
        if (slide.supportingDetail) {
          console.log(`     ${''.padEnd(11)} support:  ${slide.supportingDetail}`);
        }
      }

      // ── Comparison: Expansion vs Final Body ──
      subDivider('EXPANSION → BODY COMPARISON (FACT slides only)');
      const factSlides = result.carousel.slides.filter(s => s.role === 'FACT');
      for (const [i, slide] of factSlides.entries()) {
        const expanded = result.expandedFacts[i];
        if (!expanded) continue;

        console.log(`\n  Slide ${slide.slideNumber} / Fact ${i + 1}:`);
        console.log(`    EXPANSION (${expanded.expansion.length} chars):`);
        console.log(`      "${expanded.expansion}"`);
        console.log(`    FINAL BODY (${slide.body.length} chars):`);
        console.log(`      "${slide.body}"`);

        // Check if body substantially uses expansion content
        const expansionWords = new Set(expanded.expansion.toLowerCase().split(/\s+/));
        const bodyWords = slide.body.toLowerCase().split(/\s+/);
        const overlap = bodyWords.filter(w => expansionWords.has(w)).length;
        const overlapPct = Math.round((overlap / bodyWords.length) * 100);
        console.log(`    WORD OVERLAP: ${overlapPct}% (${overlap}/${bodyWords.length} words)`);

        if (slide.body.length < 140) {
          console.log(`    ⚠️  BODY TOO SHORT (< 140 chars)`);
        }
        if (slide.body.length > 400) {
          console.log(`    ⚠️  BODY TOO LONG (> 400 chars)`);
        }
      }

      // ── Quality Summary ──
      subDivider('QUALITY SUMMARY');
      const factBodies = factSlides.map(s => s.body);
      const avgLen = Math.round(factBodies.reduce((a, b) => a + b.length, 0) / factBodies.length);
      const minLen = Math.min(...factBodies.map(b => b.length));
      const maxLen = Math.max(...factBodies.map(b => b.length));
      console.log(`  Fact slide body lengths: avg=${avgLen}, min=${minLen}, max=${maxLen}`);
      console.log(`  Validation: ${result.validation.passed ? 'PASSED' : 'FAILED'} (score: ${result.validation.score}/100)`);
      console.log(`  Quality warning: ${result.qualityWarning}`);
      console.log(`  Patched slides: [${result.patchedSlideIndices.join(', ')}]`);
      console.log(`  Mode: ${result.mode}, Concept: "${result.concept}"`);

    } catch (err) {
      console.error(`\n  ❌ PIPELINE FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  divider('TEST COMPLETE');
}

runTest().catch(console.error);
