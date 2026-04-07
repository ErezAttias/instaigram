/**
 * Audit script: generates 10 posts across diverse topics and evaluates
 * opener, implication, and fact-slide quality after prompt improvements.
 *
 * Usage: npx tsx scripts/audit-output-quality.ts
 */

import { config } from 'dotenv';
import { resolve as pathResolve } from 'path';
config({ path: pathResolve(__dirname, '..', '.env.local') });

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
import { getAIProvider, resetAIProvider } from '@/lib/ai/provider';

// ─── 10 diverse topics ──────────────────────────────────────

const POSTS = [
  { topic: 'animal facts', hook: { text: 'Octopuses have three hearts and blue blood', type: 'HIDDEN_TRUTH' } },
  { topic: 'space facts', hook: { text: 'A teaspoon of neutron star weighs 6 billion tons', type: 'EXTREME' } },
  { topic: 'food science', hook: { text: 'Honey never spoils — 3,000-year-old jars are still edible', type: 'HIDDEN_TRUTH' } },
  { topic: 'psychology facts', hook: { text: 'Your brain decides 7 seconds before you realize it', type: 'MECHANISM' } },
  { topic: 'ocean facts', hook: { text: 'We have better maps of Mars than of our own ocean floor', type: 'CONTRADICTION' } },
  { topic: 'human body facts', hook: { text: 'Your bones are stronger than steel pound for pound', type: 'EXTREME' } },
  { topic: 'ancient civilizations', hook: { text: 'The Egyptians used moldy bread as antibiotics', type: 'HIDDEN_TRUTH' } },
  { topic: 'physics facts', hook: { text: 'Time moves faster on your head than your feet', type: 'MECHANISM' } },
  { topic: 'plant facts', hook: { text: 'Trees talk to each other through underground fungal networks', type: 'HIDDEN_TRUTH' } },
  { topic: 'technology history', hook: { text: 'Your phone has more computing power than all of NASA in 1969', type: 'EXTREME' } },
];

// ─── Helpers ────────────────────────────────────────────────

function hasConcreteAnchor(text: string): boolean {
  // Check for numbers
  if (/\d/.test(text)) return true;
  // Check for comparison words
  if (/\b(than|vs|versus|outperform|outlast|beat|faster|slower|heavier|lighter|stronger|weaker|more|less|bigger|smaller)\b/i.test(text)) return true;
  // Check for named entities (capitalized words that aren't sentence starters)
  const words = text.split(/\s+/);
  const capitalizedNonStart = words.slice(1).filter(w => /^[A-Z][a-z]/.test(w));
  if (capitalizedNonStart.length > 0) return true;
  return false;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).length;
}

interface PostResult {
  index: number;
  topic: string;
  hookText: string;
  opener: { displayTitle: string; displaySupport: string };
  implication: { displayTitle: string; displaySupport: string };
  implicationRaw: { headline: string; body: string };
  facts: Array<{ displayTitle: string; displaySupport: string }>;
  fallback?: string;
  openerScore: { hasAnchor: boolean; wordCount: number; gapFeels: string };
  implicationScore: { hasAnchor: boolean; feelsLikePayoff: string };
  factVariety: { patterns: string[]; hasConsecutiveSame: boolean };
}

function classifyLeadPattern(title: string): string {
  if (/^\d|^\S*\d/.test(title)) return 'NUMBER';
  // Check if starts with a proper noun / entity
  const firstWord = title.split(/\s+/)[0];
  if (/^[A-Z][a-z]/.test(firstWord) && !/^(The|A|An|It|This|That|Your|Our|We|No|Not|Every|Most|Some|How|Why|What)$/.test(firstWord)) return 'ENTITY';
  if (/\b(than|vs|versus|but|yet|while|instead)\b/i.test(title)) return 'CONTRAST';
  return 'OTHER';
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  resetAIProvider();
  const ai = getAIProvider();
  console.log(`Provider: ${ai.providerName} / ${ai.modelName}`);
  console.log(`Generating 10 posts...\n`);

  const results: PostResult[] = [];

  for (let i = 0; i < POSTS.length; i++) {
    const { topic, hook } = POSTS[i];
    const label = `[${i + 1}/10] ${topic}`;
    process.stdout.write(`${label}...`);

    try {
      const result = await generateCarousel({ topic, hook }, ai);

      const compressed = result.compressedSlides;
      const slides = result.carousel.slides;

      // Find opener, implication, facts
      const openerCompressed = compressed.find(c => c.slideNumber === 0) ?? { slideNumber: 0, displayTitle: '(missing)', displaySupport: '' };
      const implicationSlide = slides.find(s => s.role === 'IMPLICATION');
      const implicationIdx = implicationSlide?.slideNumber ?? (slides.length - 2);
      const implicationCompressed = compressed.find(c => c.slideNumber === implicationIdx) ?? { slideNumber: implicationIdx, displayTitle: '(missing)', displaySupport: '' };
      const factSlides = compressed.filter(c => {
        const slide = slides.find(s => s.slideNumber === c.slideNumber);
        return slide?.role === 'FACT';
      }).slice(0, 3);

      const factPatterns = factSlides.map(f => classifyLeadPattern(f.displayTitle));
      const hasConsecutiveSame = factPatterns.some((p, j) => j > 0 && p === factPatterns[j - 1]);

      const postResult: PostResult = {
        index: i + 1,
        topic,
        hookText: hook.text,
        opener: { displayTitle: openerCompressed.displayTitle, displaySupport: openerCompressed.displaySupport },
        implication: { displayTitle: implicationCompressed.displayTitle, displaySupport: implicationCompressed.displaySupport },
        implicationRaw: { headline: implicationSlide?.headline ?? '(missing)', body: implicationSlide?.body ?? '(missing)' },
        facts: factSlides.map(f => ({ displayTitle: f.displayTitle, displaySupport: f.displaySupport })),
        fallback: result.fallback?.level,
        openerScore: {
          hasAnchor: hasConcreteAnchor(openerCompressed.displayTitle),
          wordCount: wordCount(openerCompressed.displayTitle),
          gapFeels: '', // filled manually in output
        },
        implicationScore: {
          hasAnchor: hasConcreteAnchor(implicationCompressed.displayTitle),
          feelsLikePayoff: '',
        },
        factVariety: {
          patterns: factPatterns,
          hasConsecutiveSame,
        },
      };

      results.push(postResult);
      console.log(` done${result.fallback ? ` (fallback: ${result.fallback.level})` : ''}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(` FAILED: ${msg}`);
    }
  }

  // ─── Print results ────────────────────────────────────────

  console.log('\n\n' + '═'.repeat(80));
  console.log('  AUDIT RESULTS: 10 POSTS');
  console.log('═'.repeat(80));

  for (const r of results) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`POST ${r.index}: ${r.topic} ${r.fallback ? `[FALLBACK: ${r.fallback}]` : ''}`);
    console.log(`Hook: "${r.hookText}"`);
    console.log(`${'─'.repeat(80)}`);

    console.log(`\n  OPENER:`);
    console.log(`    displayTitle:   "${r.opener.displayTitle}"`);
    console.log(`    displaySupport: "${r.opener.displaySupport}"`);
    console.log(`    → anchor: ${r.openerScore.hasAnchor ? 'YES' : 'NO'} | words: ${r.openerScore.wordCount}`);

    console.log(`\n  FACT SLIDES (first 3):`);
    for (let j = 0; j < r.facts.length; j++) {
      const f = r.facts[j];
      const pattern = r.factVariety.patterns[j];
      console.log(`    [${pattern}] "${f.displayTitle}"`);
      console.log(`           "${f.displaySupport}"`);
    }
    console.log(`    → variety: ${r.factVariety.patterns.join(' → ')} | consecutive-same: ${r.factVariety.hasConsecutiveSame ? 'YES (bad)' : 'NO (good)'}`);

    console.log(`\n  IMPLICATION:`);
    console.log(`    displayTitle:   "${r.implication.displayTitle}"`);
    console.log(`    displaySupport: "${r.implication.displaySupport}"`);
    console.log(`    raw headline:   "${r.implicationRaw.headline}"`);
    console.log(`    raw body:       "${r.implicationRaw.body}"`);
    console.log(`    → anchor: ${r.implicationScore.hasAnchor ? 'YES' : 'NO'}`);
  }

  // ─── Summary Stats ────────────────────────────────────────

  console.log('\n\n' + '═'.repeat(80));
  console.log('  SUMMARY STATS');
  console.log('═'.repeat(80));

  const openerAnchorRate = results.filter(r => r.openerScore.hasAnchor).length;
  const implAnchorRate = results.filter(r => r.implicationScore.hasAnchor).length;
  const avgOpenerWords = results.reduce((sum, r) => sum + r.openerScore.wordCount, 0) / results.length;
  const varietyFailRate = results.filter(r => r.factVariety.hasConsecutiveSame).length;
  const fallbackCount = results.filter(r => r.fallback && r.fallback !== 'none').length;

  console.log(`\n  Openers with concrete anchor:  ${openerAnchorRate}/${results.length}`);
  console.log(`  Avg opener word count:         ${avgOpenerWords.toFixed(1)}`);
  console.log(`  Implications with anchor:      ${implAnchorRate}/${results.length}`);
  console.log(`  Fact sequences with monotony:  ${varietyFailRate}/${results.length}`);
  console.log(`  Posts with fallback:           ${fallbackCount}/${results.length}`);

  console.log('\n  Done.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
