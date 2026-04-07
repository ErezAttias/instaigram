/**
 * Reliability audit for the fallback system.
 * Runs 24 posts across 8 diverse topics through the full pipeline
 * and reports on fallback triggers, levels, and output quality.
 *
 * Usage: npx tsx scripts/audit-fallback-reliability.ts
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

import { generateCarousel, PipelineResult } from '@/lib/pipeline/carousel-pipeline';
import { getAIProvider } from '@/lib/ai/provider';

// ─── 24 test cases across 8 topics (3 hooks each) ──────────

const TEST_CASES: Array<{ topic: string; hook: { text: string; type: string } }> = [
  // Topic 1: Animal facts (broad, well-known)
  { topic: 'animal facts', hook: { text: 'Octopuses have three hearts and blue blood', type: 'HIDDEN_TRUTH' } },
  { topic: 'animal facts', hook: { text: 'Cows have best friends and get stressed when separated', type: 'HIDDEN_TRUTH' } },
  { topic: 'animal facts', hook: { text: 'The mantis shrimp can punch at 50 mph underwater', type: 'HIDDEN_TRUTH' } },

  // Topic 2: History (niche, requires specific knowledge)
  { topic: 'strange historical facts', hook: { text: 'Napoleon was once attacked by a horde of rabbits', type: 'HIDDEN_TRUTH' } },
  { topic: 'strange historical facts', hook: { text: 'Ancient Romans used urine as mouthwash', type: 'CONTRARIAN' } },
  { topic: 'strange historical facts', hook: { text: 'Cleopatra lived closer to the Moon landing than to the pyramids', type: 'HIDDEN_TRUTH' } },

  // Topic 3: Space / science (data-heavy)
  { topic: 'space facts', hook: { text: 'A teaspoon of neutron star weighs 6 billion tons', type: 'HIDDEN_TRUTH' } },
  { topic: 'space facts', hook: { text: 'There are more stars in the universe than grains of sand on Earth', type: 'CONTRARIAN' } },
  { topic: 'space facts', hook: { text: 'Venus spins in the opposite direction to most planets', type: 'HIDDEN_TRUTH' } },

  // Topic 4: Psychology (abstract, harder to ground)
  { topic: 'psychology facts', hook: { text: 'Your brain makes decisions 7 seconds before you realize it', type: 'HIDDEN_TRUTH' } },
  { topic: 'psychology facts', hook: { text: 'The Dunning-Kruger effect explains why incompetent people think they are experts', type: 'CALL_OUT' } },
  { topic: 'psychology facts', hook: { text: 'Nostalgia was once considered a mental illness', type: 'HIDDEN_TRUTH' } },

  // Topic 5: Food / cooking (niche lifestyle)
  { topic: 'food science', hook: { text: 'Honey never spoils — archaeologists found 3000-year-old edible honey', type: 'HIDDEN_TRUTH' } },
  { topic: 'food science', hook: { text: 'Bananas are berries but strawberries are not', type: 'CONTRARIAN' } },
  { topic: 'food science', hook: { text: 'Carrots were originally purple before the 17th century', type: 'HIDDEN_TRUTH' } },

  // Topic 6: Technology (fast-changing domain)
  { topic: 'technology facts', hook: { text: 'The first computer bug was a literal moth stuck in a relay', type: 'HIDDEN_TRUTH' } },
  { topic: 'technology facts', hook: { text: 'Your smartphone has more computing power than all of NASA in 1969', type: 'CONTRARIAN' } },
  { topic: 'technology facts', hook: { text: 'The QWERTY keyboard was designed to slow typists down', type: 'MISTAKE_EXPOSURE' } },

  // Topic 7: Economics / money (abstract + numbers)
  { topic: 'economics facts', hook: { text: '90% of the world\'s money exists only digitally', type: 'HIDDEN_TRUTH' } },
  { topic: 'economics facts', hook: { text: 'Inflation was so bad in Zimbabwe they printed 100 trillion dollar bills', type: 'HIDDEN_TRUTH' } },
  { topic: 'economics facts', hook: { text: 'The US national debt grows by $1 million every 30 seconds', type: 'CALL_OUT' } },

  // Topic 8: Human body (concrete, relatable)
  { topic: 'human body facts', hook: { text: 'Your stomach gets a new lining every 3-4 days', type: 'HIDDEN_TRUTH' } },
  { topic: 'human body facts', hook: { text: 'You produce enough saliva in a lifetime to fill two swimming pools', type: 'HIDDEN_TRUTH' } },
  { topic: 'human body facts', hook: { text: 'The human nose can detect over 1 trillion different scents', type: 'CONTRARIAN' } },
];

// ─── Quality Assessment ─────────────────────────────────────

interface PostAuditResult {
  index: number;
  topic: string;
  hookText: string;
  fallbackTriggered: boolean;
  fallbackLevel: string;
  fallbackReason: string;
  stageErrors: string[];
  slideCount: number;
  validationPassed: boolean;
  validationScore: number;
  hardFails: number;
  qualityWarning: boolean;
  hasEmptySlides: boolean;
  hasEmptyHeadlines: boolean;
  acceptableOutput: boolean;
  acceptabilityNotes: string;
  durationMs: number;
}

function assessQuality(result: PipelineResult): { acceptable: boolean; notes: string } {
  const issues: string[] = [];

  // Check for empty/missing content
  if (!result.carousel.slides || result.carousel.slides.length === 0) {
    return { acceptable: false, notes: 'NO SLIDES — empty carousel' };
  }

  const emptyHeadlines = result.carousel.slides.filter(s => !s.headline || s.headline.trim().length === 0);
  if (emptyHeadlines.length > 0) {
    issues.push(`${emptyHeadlines.length} empty headline(s)`);
  }

  const emptyBodies = result.carousel.slides.filter(s => s.role === 'FACT' && (!s.body || s.body.trim().length < 50));
  if (emptyBodies.length > 0) {
    issues.push(`${emptyBodies.length} FACT slide(s) with very short body`);
  }

  // Check slide structure
  const roles = result.carousel.slides.map(s => s.role);
  if (roles[0] !== 'OPENER') issues.push('Missing OPENER as first slide');
  if (roles[roles.length - 1] !== 'CTA') issues.push('Missing CTA as last slide');
  if (!roles.includes('IMPLICATION')) issues.push('Missing IMPLICATION slide');
  if (roles.filter(r => r === 'FACT').length < 2) issues.push('Fewer than 2 FACT slides');

  // Check compressed display fields
  if (result.compressedSlides.length === 0) {
    issues.push('No compressed slides');
  } else {
    const emptyDisplay = result.compressedSlides.filter(c => !c.displayTitle || c.displayTitle.trim().length === 0);
    if (emptyDisplay.length > 0) {
      issues.push(`${emptyDisplay.length} empty displayTitle(s)`);
    }
  }

  // Validation score threshold
  if (result.validation.score < 30) {
    issues.push(`Very low validation score: ${result.validation.score}/100`);
  }

  const acceptable = issues.length === 0 || (issues.length <= 2 && !issues.some(i => i.includes('NO SLIDES') || i.includes('empty carousel')));
  return {
    acceptable,
    notes: issues.length > 0 ? issues.join('; ') : 'All checks passed',
  };
}

// ─── Main Runner ────────────────────────────────────────────

async function runAudit() {
  const ai = getAIProvider();
  console.log(`\n🔍 FALLBACK RELIABILITY AUDIT`);
  console.log(`Provider: ${ai.providerName} / ${ai.modelName}`);
  console.log(`Test cases: ${TEST_CASES.length}`);
  console.log('═'.repeat(80));

  const results: PostAuditResult[] = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const { topic, hook } = TEST_CASES[i];
    const label = `[${i + 1}/${TEST_CASES.length}]`;

    console.log(`\n${label} Topic: "${topic}" | Hook: "${hook.text.slice(0, 50)}..."`);

    const startMs = Date.now();
    let result: PipelineResult;
    try {
      result = await generateCarousel({ topic, hook }, ai);
    } catch (err) {
      // This should NEVER happen with the fallback system
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ CRITICAL: Pipeline threw despite fallback system: ${msg.slice(0, 200)}`);
      results.push({
        index: i + 1,
        topic,
        hookText: hook.text,
        fallbackTriggered: true,
        fallbackLevel: 'PIPELINE_CRASH',
        fallbackReason: msg.slice(0, 300),
        stageErrors: [msg.slice(0, 300)],
        slideCount: 0,
        validationPassed: false,
        validationScore: 0,
        hardFails: 0,
        qualityWarning: true,
        hasEmptySlides: true,
        hasEmptyHeadlines: true,
        acceptableOutput: false,
        acceptabilityNotes: 'Pipeline crashed — no output',
        durationMs: Date.now() - startMs,
      });
      continue;
    }

    const durationMs = Date.now() - startMs;
    const quality = assessQuality(result);
    const fb = result.fallback;
    const hasEmptySlides = !result.carousel.slides || result.carousel.slides.length === 0;
    const hasEmptyHeadlines = result.carousel.slides.some(s => !s.headline || s.headline.trim().length === 0);

    const auditResult: PostAuditResult = {
      index: i + 1,
      topic,
      hookText: hook.text,
      fallbackTriggered: !!fb,
      fallbackLevel: fb?.level || 'none',
      fallbackReason: fb?.reason || '',
      stageErrors: fb?.stageErrors.map(e => `${e.stage}: ${e.error.slice(0, 100)}`) || [],
      slideCount: result.carousel.slides.length,
      validationPassed: result.validation.passed,
      validationScore: result.validation.score,
      hardFails: result.validation.hardFails.length,
      qualityWarning: result.qualityWarning,
      hasEmptySlides,
      hasEmptyHeadlines,
      acceptableOutput: quality.acceptable,
      acceptabilityNotes: quality.notes,
      durationMs,
    };

    results.push(auditResult);

    // Log per-post summary
    const status = fb ? `⚠ FALLBACK L${fb.level === 'skip_evaluation' ? '2' : fb.level === 'skip_compression' ? '3' : fb.level === 'replace_implication' ? '4' : fb.level === 'safe_minimal' ? '5' : '?'}` : '✅ NORMAL';
    console.log(`  ${status} | ${result.carousel.slides.length} slides | score: ${result.validation.score}/100 | ${quality.acceptable ? 'ACCEPTABLE' : '⛔ UNACCEPTABLE'} | ${durationMs}ms`);
    if (fb) {
      console.log(`    Fallback: ${fb.level} — ${fb.reason.slice(0, 120)}`);
    }
    if (!quality.acceptable) {
      console.log(`    Issues: ${quality.notes}`);
    }
  }

  // ─── Summary Report ─────────────────────────────────────
  printSummary(results);
}

function printSummary(results: PostAuditResult[]) {
  const total = results.length;
  const divider = '═'.repeat(80);

  console.log(`\n\n${divider}`);
  console.log('  RELIABILITY AUDIT SUMMARY');
  console.log(divider);

  // ── Fallback Distribution ──
  const noFallback = results.filter(r => !r.fallbackTriggered);
  const level2 = results.filter(r => r.fallbackLevel === 'skip_evaluation');
  const level3 = results.filter(r => r.fallbackLevel === 'skip_compression');
  const level4 = results.filter(r => r.fallbackLevel === 'replace_implication');
  const level5 = results.filter(r => r.fallbackLevel === 'safe_minimal');
  const crashed = results.filter(r => r.fallbackLevel === 'PIPELINE_CRASH');

  console.log('\n  FALLBACK DISTRIBUTION:');
  console.log(`    No fallback (Level 1):        ${noFallback.length}/${total} (${pct(noFallback.length, total)})`);
  console.log(`    Skip evaluation (Level 2):    ${level2.length}/${total} (${pct(level2.length, total)})`);
  console.log(`    Skip compression (Level 3):   ${level3.length}/${total} (${pct(level3.length, total)})`);
  console.log(`    Replace implication (Level 4): ${level4.length}/${total} (${pct(level4.length, total)})`);
  console.log(`    Safe minimal (Level 5):       ${level5.length}/${total} (${pct(level5.length, total)})`);
  if (crashed.length > 0) {
    console.log(`    ❌ CRASH (unrecoverable):      ${crashed.length}/${total} (${pct(crashed.length, total)})`);
  }

  // ── Acceptability ──
  const acceptable = results.filter(r => r.acceptableOutput);
  const unacceptable = results.filter(r => !r.acceptableOutput);

  console.log('\n  OUTPUT QUALITY:');
  console.log(`    Acceptable:   ${acceptable.length}/${total} (${pct(acceptable.length, total)})`);
  console.log(`    Unacceptable: ${unacceptable.length}/${total} (${pct(unacceptable.length, total)})`);
  console.log(`    Empty posts:  ${results.filter(r => r.hasEmptySlides).length}/${total}`);

  // ── Validation Stats ──
  const scores = results.map(r => r.validationScore);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const passRate = results.filter(r => r.validationPassed).length;

  console.log('\n  VALIDATION:');
  console.log(`    Pass rate:        ${passRate}/${total} (${pct(passRate, total)})`);
  console.log(`    Avg score:        ${avgScore}/100`);
  console.log(`    Min score:        ${Math.min(...scores)}/100`);
  console.log(`    Max score:        ${Math.max(...scores)}/100`);

  // ── Timing ──
  const durations = results.map(r => r.durationMs);
  const avgMs = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  console.log('\n  TIMING:');
  console.log(`    Avg:  ${(avgMs / 1000).toFixed(1)}s`);
  console.log(`    Min:  ${(Math.min(...durations) / 1000).toFixed(1)}s`);
  console.log(`    Max:  ${(Math.max(...durations) / 1000).toFixed(1)}s`);

  // ── Per-Post Table ──
  console.log('\n  DETAILED RESULTS:');
  console.log('  ' + '-'.repeat(76));
  console.log(`  ${'#'.padEnd(4)} ${'Topic'.padEnd(22)} ${'Level'.padEnd(20)} ${'Score'.padEnd(8)} ${'Slides'.padEnd(8)} ${'OK?'.padEnd(5)} Time`);
  console.log('  ' + '-'.repeat(76));

  for (const r of results) {
    const lvl = r.fallbackTriggered ? r.fallbackLevel : 'none';
    console.log(
      `  ${String(r.index).padEnd(4)} ` +
      `${r.topic.slice(0, 20).padEnd(22)} ` +
      `${lvl.padEnd(20)} ` +
      `${String(r.validationScore).padEnd(8)} ` +
      `${String(r.slideCount).padEnd(8)} ` +
      `${(r.acceptableOutput ? '✅' : '⛔').padEnd(5)} ` +
      `${(r.durationMs / 1000).toFixed(1)}s`
    );
  }

  // ── Best & Worst Fallback Recoveries ──
  const fallbackResults = results.filter(r => r.fallbackTriggered);

  if (fallbackResults.length > 0) {
    // Best: fallback triggered but still acceptable with highest score
    const bestRecoveries = [...fallbackResults]
      .filter(r => r.acceptableOutput)
      .sort((a, b) => b.validationScore - a.validationScore)
      .slice(0, 3);

    console.log('\n  🏆 BEST FALLBACK RECOVERIES:');
    if (bestRecoveries.length === 0) {
      console.log('    (none — no fallback produced acceptable output)');
    } else {
      for (const r of bestRecoveries) {
        console.log(`    #${r.index} [${r.topic}] Level=${r.fallbackLevel}, score=${r.validationScore}/100`);
        console.log(`      Hook: "${r.hookText.slice(0, 60)}"`);
        console.log(`      Reason: ${r.fallbackReason.slice(0, 100)}`);
      }
    }

    // Worst: fallback triggered and unacceptable, or lowest score
    const worstRecoveries = [...fallbackResults]
      .sort((a, b) => {
        if (a.acceptableOutput !== b.acceptableOutput) return a.acceptableOutput ? 1 : -1;
        return a.validationScore - b.validationScore;
      })
      .slice(0, 3);

    console.log('\n  💀 WORST FALLBACK RECOVERIES:');
    for (const r of worstRecoveries) {
      console.log(`    #${r.index} [${r.topic}] Level=${r.fallbackLevel}, score=${r.validationScore}/100, acceptable=${r.acceptableOutput}`);
      console.log(`      Hook: "${r.hookText.slice(0, 60)}"`);
      console.log(`      Issues: ${r.acceptabilityNotes.slice(0, 120)}`);
    }
  } else {
    console.log('\n  No fallbacks triggered — all posts went through normal pipeline.');
  }

  // ── Overused Levels ──
  console.log('\n  ⚠ FALLBACK FREQUENCY ANALYSIS:');
  const fallbackRate = fallbackResults.length / total;
  if (fallbackRate > 0.25) {
    console.log(`    WARNING: ${pct(fallbackResults.length, total)} of posts triggered fallback — pipeline may have deeper issues`);
  } else if (fallbackRate > 0.1) {
    console.log(`    NOTICE: ${pct(fallbackResults.length, total)} of posts triggered fallback — worth monitoring`);
  } else {
    console.log(`    GOOD: Only ${pct(fallbackResults.length, total)} of posts triggered fallback`);
  }

  for (const [level, count] of [
    ['skip_evaluation (L2)', level2.length],
    ['skip_compression (L3)', level3.length],
    ['replace_implication (L4)', level4.length],
    ['safe_minimal (L5)', level5.length],
  ] as [string, number][]) {
    if (count > 2) {
      console.log(`    ⚠ ${level}: triggered ${count}x — investigate root cause`);
    }
  }

  // ── Final Verdict ──
  console.log('\n' + divider);
  console.log('  VERDICT');
  console.log(divider);

  const crashCount = crashed.length;
  const emptyCount = results.filter(r => r.hasEmptySlides).length;
  const acceptableRate = acceptable.length / total;

  if (emptyCount > 0 || crashCount > 0) {
    console.log('  ❌ UNRELIABLE — Empty posts or crashes detected. Fallback system has gaps.');
  } else if (acceptableRate < 0.9) {
    console.log('  ⚠ PARTIALLY RELIABLE — No empty posts, but too many unacceptable outputs.');
    console.log(`    Acceptable rate: ${pct(acceptable.length, total)}`);
  } else if (fallbackRate > 0.3) {
    console.log('  ⚠ RELIABLE BUT MASKING — Fallback is covering for deeper pipeline issues.');
    console.log(`    Fallback rate: ${pct(fallbackResults.length, total)} — fix root causes.`);
  } else {
    console.log('  ✅ RELIABLE — Pipeline is stable. Fallback is a safety net, not a crutch.');
    console.log(`    ${pct(acceptable.length, total)} acceptable, ${pct(fallbackResults.length, total)} fallback rate.`);
  }

  console.log('');
}

function pct(n: number, total: number): string {
  return `${Math.round((n / total) * 100)}%`;
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
