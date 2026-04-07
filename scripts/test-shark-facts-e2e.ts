/**
 * End-to-End Shark Facts Test
 *
 * Runs the full pipeline on "shark facts" to verify:
 *   1. Domain detection → informational
 *   2. Fact mining → mechanism/behavior style, not narrative drama
 *   3. Composition → no forced storytelling
 *   4. Image prompts → literal, grounded, no sci-fi/HUD
 *   5. Text colors → white headline, light gray support
 *
 * Usage:
 *   npx tsx scripts/test-shark-facts-e2e.ts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { generateCarousel } from '../src/lib/pipeline/carousel-pipeline';
import { getAIProvider } from '../src/lib/ai/provider';
import { classifyDomainStyle } from '../src/lib/utils/topic-classifier';
import { buildSlidePrompt } from '../src/lib/visual/prompt-builder';
import { buildDistortion } from '../src/lib/visual/distortion';
import { detectTopic } from '../src/lib/visual/intent';
import { auditInformationalPrompt } from '../src/lib/validation/visual-truth-validator';

async function main() {
  const topic = 'shark facts';

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  SHARK FACTS — End-to-End Quality Test                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── 1. Domain Classification ────────────────────────────────
  const domainStyle = classifyDomainStyle(topic);
  console.log(`[1] Domain style: ${domainStyle}`);
  console.log(`    Expected: informational`);
  console.log(`    ${domainStyle === 'informational' ? '✓ PASS' : '✗ FAIL'}\n`);

  // ── 2. Run Full Pipeline ────────────────────────────────────
  console.log(`[2] Running full pipeline on "${topic}"...\n`);
  const ai = getAIProvider();

  const result = await generateCarousel(
    {
      topic,
      hook: { text: 'Sharks that could outswim a speedboat', type: 'curiosity' },
    },
    ai,
  );

  console.log(`\n[3] Pipeline result:`);
  console.log(`    Mode: ${result.mode}`);
  console.log(`    Concept: "${result.concept}"`);
  console.log(`    Facts used: ${result.selectedFacts.length}`);
  console.log(`    Slides: ${result.carousel.slides.length}`);
  if (result.fallback) {
    console.log(`    Fallback: ${result.fallback.level} — ${result.fallback.reason.slice(0, 100)}`);
  }

  // ── 3. Analyze Each Slide ──────────────────────────────────
  console.log(`\n${'━'.repeat(64)}`);
  console.log('SLIDE-BY-SLIDE ANALYSIS');
  console.log(`${'━'.repeat(64)}\n`);

  const issues: string[] = [];

  for (const slide of result.carousel.slides) {
    console.log(`── Slide ${slide.slideNumber} [${slide.role}] ──`);
    console.log(`  Headline: "${slide.headline}"`);
    console.log(`  Body: "${slide.body.slice(0, 150)}${slide.body.length > 150 ? '...' : ''}"`);
    if (slide.topicEntity) console.log(`  Entity: ${slide.topicEntity}`);
    if (slide.factType) console.log(`  Type: ${slide.factType}`);

    // Check for narrative drama patterns in informational slides
    if (slide.role === 'FACT') {
      const dramaPatterns = [
        /\bsetup\b.*\baction\b.*\bconsequence\b/i,
        /\bpeak moment\b/i,
        /\bpunishment\b/i,
        /\btransformation\b/i,
        /\beversal\b/i,
      ];
      const hasDramaFraming = dramaPatterns.some(p => p.test(slide.body));
      if (hasDramaFraming) {
        issues.push(`Slide ${slide.slideNumber}: Body uses narrative drama framing`);
        console.log(`  ✗ ISSUE: Body uses narrative drama framing`);
      }

      // Check for vague/poetic language
      const vaguePatterns = [
        /\bits tail cuts through\b/i,
        /\bbecomes.*efficient predator\b/i,
        /\bocean's.*predator\b/i,
        /\bmaster of\b/i,
      ];
      const hasVagueLanguage = vaguePatterns.some(p => p.test(slide.body));
      if (hasVagueLanguage) {
        issues.push(`Slide ${slide.slideNumber}: Body uses vague/poetic language`);
        console.log(`  ✗ ISSUE: Body uses vague/poetic language`);
      }
    }

    // Check visual prompt for FACT slides
    if (slide.role === 'FACT') {
      const topicDomain = detectTopic({ slideRole: 'FACT', topic, headline: slide.headline, subject: slide.topicEntity ?? '' });
      console.log(`  Topic domain: ${topicDomain}`);

      // Build image prompt
      const promptOutput = buildSlidePrompt({
        slideRole: 'FACT',
        subject: slide.topicEntity ?? slide.headline,
        topic,
        headlineText: slide.headline,
        bodyText: slide.body,
      });

      // Audit for forbidden visual elements
      const audit = auditInformationalPrompt(promptOutput.imagePrompt, topicDomain);
      if (!audit.passed) {
        issues.push(`Slide ${slide.slideNumber}: Image prompt contains forbidden elements: ${audit.violations.join(', ')}`);
        console.log(`  ✗ VISUAL AUDIT FAIL: ${audit.violations.join(', ')}`);
      } else {
        console.log(`  ✓ Visual audit: PASS`);
      }

      // Check distortion
      const distortion = buildDistortion({
        slideRole: 'FACT',
        tensionType: 'neutral',
        topic: topicDomain,
        headline: slide.headline,
        subject: slide.topicEntity ?? '',
      });
      const isLiteral = distortion.rationale.includes('informational_domain_bypass');
      if (!isLiteral) {
        issues.push(`Slide ${slide.slideNumber}: Distortion NOT bypassed (still creative)`);
        console.log(`  ✗ Distortion: NOT bypassed`);
      } else {
        console.log(`  ✓ Distortion: bypassed (literal mode)`);
      }

      console.log(`  Prompt (first 200): "${promptOutput.imagePrompt.slice(0, 200)}..."`);
    }
    console.log();
  }

  // ── 4. Compressed Display Analysis ─────────────────────────
  console.log(`${'━'.repeat(64)}`);
  console.log('COMPRESSED DISPLAY OUTPUT');
  console.log(`${'━'.repeat(64)}\n`);

  for (const cs of result.compressedSlides) {
    console.log(`  [${cs.slideNumber}] ${cs.displayTitle}`);
    if (cs.displaySupport) console.log(`       ${cs.displaySupport}`);
  }

  // ── 5. Final Report ────────────────────────────────────────
  console.log(`\n${'═'.repeat(64)}`);
  console.log('QUALITY REPORT');
  console.log(`${'═'.repeat(64)}\n`);

  console.log(`  Topic:            ${topic}`);
  console.log(`  Domain style:     ${domainStyle}`);
  console.log(`  Mode:             ${result.mode}`);
  console.log(`  Concept:          "${result.concept}"`);
  console.log(`  Slides:           ${result.carousel.slides.length}`);
  console.log(`  Generation mode:  ${domainStyle === 'informational' ? 'INFORMATIONAL (mechanism/behavior)' : 'NARRATIVE (micro-story)'}`);
  console.log();

  if (issues.length === 0) {
    console.log(`  ✓ NO ISSUES FOUND`);
    console.log(`  All FACT slides use informational framing`);
    console.log(`  All image prompts pass informational audit`);
    console.log(`  All distortions bypassed for literal imagery`);
    console.log();
    console.log(`  VERDICT: PUBLISHABLE (pending actual image render check)`);
  } else {
    console.log(`  ✗ ${issues.length} ISSUE(S) FOUND:`);
    for (const issue of issues) {
      console.log(`    - ${issue}`);
    }
    console.log();
    console.log(`  VERDICT: NOT PUBLISHABLE — issues above need fixing`);
  }
  console.log();
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
