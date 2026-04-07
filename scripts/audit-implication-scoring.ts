/**
 * Audit script: runs the new implication compression + strength evaluation
 * pipeline on recent posts and outputs a detailed report.
 *
 * Usage: npx tsx scripts/audit-implication-scoring.ts
 */

// Load env from .env.local and force real provider for audit
import { config } from 'dotenv';
config({ path: '.env.local' });
process.env.USE_MOCK_PROVIDER = 'false';
process.env.AI_PROVIDER = 'openai';

import { prisma } from '../src/lib/db/prisma';
import { resetAIProvider, getAIProvider } from '../src/lib/ai/provider';
import { buildImplicationCompressPrompt } from '../src/lib/pipeline/prompts/compress-implication-prompt';
import { buildEvaluateImplicationPrompt } from '../src/lib/pipeline/prompts/evaluate-implication-prompt';
import { CompressedSlideDisplay as CompressedSlideDisplaySchema, ImplicationStrengthEval } from '../src/lib/validation/schemas';
import type { GeneratedSlideV2 } from '../src/lib/validation/schemas';
import type { CompressedSlideDisplay } from '../src/lib/pipeline/steps/compress';
import { z } from 'zod';

// Relaxed schema — implication compression returns only 1 slide, not 6-7
const SingleCompressedResult = z.object({
  compressed: z.array(CompressedSlideDisplaySchema).min(1).max(1),
});

interface AuditEntry {
  postId: string;
  channel: string;
  topic: string;
  title: string;
  // Original (what's currently in DB)
  originalDisplayTitle: string | null;
  originalDisplaySupport: string | null;
  // New compression output (before eval)
  newCompressedTitle: string;
  newCompressedSupport: string;
  // Evaluation scores
  specificity: number;
  surprise: number;
  shareability: number;
  totalScore: number;
  issues: string[];
  // Auto-upgrade
  autoUpgradeTriggered: boolean;
  // Final output (after potential upgrade)
  finalDisplayTitle: string;
  finalDisplaySupport: string;
  // Improved version (if generated)
  improvedTitle?: string;
  improvedSupport?: string;
}

function slideToV2(s: {
  slideIndex: number;
  role: string;
  headline: string | null;
  body: string | null;
  text: string;
  supportingDetail: string | null;
  factType: string | null;
  containsNumber: boolean;
  concretenessScore: number;
  noveltyScore: number;
  topicEntity: string | null;
}): GeneratedSlideV2 {
  return {
    slideNumber: s.slideIndex,
    role: s.role as 'OPENER' | 'FACT' | 'IMPLICATION' | 'CTA',
    headline: s.headline || s.text,
    body: s.body || '',
    supportingDetail: s.supportingDetail || null,
    factType: s.factType as 'statistic' | 'comparison' | 'mechanism' | 'historical' | 'example' | 'definition' | null,
    containsNumber: s.containsNumber ?? false,
    concretenessScore: s.concretenessScore ?? 3,
    noveltyScore: s.noveltyScore ?? 3,
    topicEntity: s.topicEntity || null,
    factRefs: [],
  };
}

async function main() {
  resetAIProvider();
  const ai = getAIProvider();
  console.log(`\n🔬 IMPLICATION SCORING AUDIT`);
  console.log(`Provider: ${ai.providerName} / ${ai.modelName}`);
  console.log(`═══════════════════════════════════════════\n`);

  // Fetch posts with IMPLICATION slides
  const posts = await prisma.post.findMany({
    where: {
      slides: { some: { role: 'IMPLICATION', headline: { not: null } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 12,
    include: {
      slides: { orderBy: { slideIndex: 'asc' } },
      channel: { select: { name: true, niche: true } },
    },
  });

  console.log(`Found ${posts.length} posts with IMPLICATION slides.\n`);

  const results: AuditEntry[] = [];
  let processed = 0;

  for (const post of posts) {
    const implSlide = post.slides.find(s => s.role === 'IMPLICATION');
    const factSlides = post.slides.filter(s => s.role === 'FACT');
    if (!implSlide) continue;

    processed++;
    const topic = post.channel.niche || post.channel.name;
    console.log(`[${processed}/${posts.length}] Processing: "${post.title}" (${topic})`);

    const implV2 = slideToV2(implSlide);
    const factsV2 = factSlides.map(slideToV2);

    // Step 1: Run implication compression
    const compressPrompt = buildImplicationCompressPrompt({
      topic,
      implicationSlide: implV2,
      previousFacts: factsV2,
    });

    let compressed: CompressedSlideDisplay;
    try {
      const { data } = await ai.generateObject(compressPrompt, SingleCompressedResult);
      const entry = data.compressed.find(c => c.slideNumber === implSlide.slideIndex);
      if (!entry) {
        console.log(`  ⚠ Compression returned no entry, skipping`);
        continue;
      }
      compressed = entry;
    } catch (err) {
      console.log(`  ⚠ Compression failed: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    console.log(`  Compressed: "${compressed.displayTitle}"`);

    // Step 2: Run evaluation
    const evalPrompt = buildEvaluateImplicationPrompt({
      topic,
      compressed,
      implicationSlide: implV2,
      previousFacts: factsV2,
    });

    let evaluation: {
      specificity: number;
      surprise: number;
      shareability: number;
      score: number;
      issues: string[];
      improvedVersion?: { displayTitle: string; displaySupport: string };
    };
    try {
      const { data } = await ai.generateObject(evalPrompt, ImplicationStrengthEval);
      evaluation = data;
    } catch (err) {
      console.log(`  ⚠ Evaluation failed: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    const autoUpgrade = evaluation.score < 7 && !!evaluation.improvedVersion;
    const finalTitle = autoUpgrade ? evaluation.improvedVersion!.displayTitle : compressed.displayTitle;
    const finalSupport = autoUpgrade ? evaluation.improvedVersion!.displaySupport : compressed.displaySupport;

    console.log(`  Score: ${evaluation.score}/10 (S:${evaluation.specificity} U:${evaluation.surprise} H:${evaluation.shareability})`);
    if (autoUpgrade) {
      console.log(`  ↑ Upgraded: "${finalTitle}"`);
    }
    console.log('');

    results.push({
      postId: post.id,
      channel: post.channel.name,
      topic,
      title: post.title,
      originalDisplayTitle: implSlide.displayTitle,
      originalDisplaySupport: implSlide.displaySupport,
      newCompressedTitle: compressed.displayTitle,
      newCompressedSupport: compressed.displaySupport,
      specificity: evaluation.specificity,
      surprise: evaluation.surprise,
      shareability: evaluation.shareability,
      totalScore: evaluation.score,
      issues: evaluation.issues,
      autoUpgradeTriggered: autoUpgrade,
      finalDisplayTitle: finalTitle,
      finalDisplaySupport: finalSupport,
      improvedTitle: evaluation.improvedVersion?.displayTitle,
      improvedSupport: evaluation.improvedVersion?.displaySupport,
    });
  }

  // ═══════════════════════════════════════════
  // DETAILED REPORT
  // ═══════════════════════════════════════════
  console.log('\n\n');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║              IMPLICATION SCORING AUDIT REPORT                ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`\nPosts audited: ${results.length}`);
  console.log(`Auto-upgrades triggered: ${results.filter(r => r.autoUpgradeTriggered).length}/${results.length}`);
  console.log(`Average score: ${(results.reduce((sum, r) => sum + r.totalScore, 0) / results.length).toFixed(1)}/10`);

  // Per-slide detail
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PER-SLIDE DETAIL');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(`─── [${i + 1}] ${r.title} (${r.topic}) ───`);
    console.log(`  OLD (in DB):     "${r.originalDisplayTitle}"`);
    console.log(`                   "${r.originalDisplaySupport}"`);
    console.log(`  NEW compressed:  "${r.newCompressedTitle}"`);
    console.log(`                   "${r.newCompressedSupport}"`);
    console.log(`  Scores:          specificity=${r.specificity}/3  surprise=${r.surprise}/3  shareability=${r.shareability}/4  TOTAL=${r.totalScore}/10`);
    if (r.issues.length > 0) {
      console.log(`  Issues:          ${r.issues.join(', ')}`);
    }
    if (r.autoUpgradeTriggered) {
      console.log(`  ↑ AUTO-UPGRADED: "${r.finalDisplayTitle}"`);
      console.log(`                   "${r.finalDisplaySupport}"`);
    } else {
      console.log(`  Final (no upgrade needed): "${r.finalDisplayTitle}"`);
    }
    console.log(`  FINAL shown:     "${r.finalDisplayTitle}"`);
    console.log(`                   "${r.finalDisplaySupport}"`);
    console.log('');
  }

  // Score distribution
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SCORE DISTRIBUTION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const buckets: Record<string, number> = { '0-3': 0, '4-6': 0, '7-8': 0, '9-10': 0 };
  for (const r of results) {
    if (r.totalScore <= 3) buckets['0-3']++;
    else if (r.totalScore <= 6) buckets['4-6']++;
    else if (r.totalScore <= 8) buckets['7-8']++;
    else buckets['9-10']++;
  }
  for (const [range, count] of Object.entries(buckets)) {
    const bar = '█'.repeat(count * 3) + '░'.repeat((results.length - count) * 3);
    console.log(`  ${range.padEnd(5)} │ ${bar} ${count}`);
  }

  // Dimension averages
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('DIMENSION AVERAGES');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const avgSpec = results.reduce((s, r) => s + r.specificity, 0) / results.length;
  const avgSurp = results.reduce((s, r) => s + r.surprise, 0) / results.length;
  const avgShare = results.reduce((s, r) => s + r.shareability, 0) / results.length;
  console.log(`  Specificity:  ${avgSpec.toFixed(1)}/3  ${'█'.repeat(Math.round(avgSpec * 10))}${'░'.repeat(30 - Math.round(avgSpec * 10))}`);
  console.log(`  Surprise:     ${avgSurp.toFixed(1)}/3  ${'█'.repeat(Math.round(avgSurp * 10))}${'░'.repeat(30 - Math.round(avgSurp * 10))}`);
  console.log(`  Shareability: ${avgShare.toFixed(1)}/4  ${'█'.repeat(Math.round(avgShare * 7.5))}${'░'.repeat(30 - Math.round(avgShare * 7.5))}`);

  // Issue frequency
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('ISSUE FREQUENCY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const issueCounts: Record<string, number> = {};
  for (const r of results) {
    for (const issue of r.issues) {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    }
  }
  const sortedIssues = Object.entries(issueCounts).sort((a, b) => b[1] - a[1]);
  for (const [issue, count] of sortedIssues) {
    console.log(`  ${issue.padEnd(20)} ${count}/${results.length} (${Math.round(count / results.length * 100)}%)`);
  }
  if (sortedIssues.length === 0) {
    console.log('  (no issues detected)');
  }

  // JSON dump for further analysis
  const outputPath = 'scripts/audit-implication-results.json';
  const fs = await import('fs');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n\nFull results written to ${outputPath}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
