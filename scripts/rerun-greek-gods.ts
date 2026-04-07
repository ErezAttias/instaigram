/**
 * Greek Gods Rerun — Single topic, full detail, real LLM.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/rerun-greek-gods.ts
 */

import { register } from 'tsconfig-paths';
import { resolve } from 'path';
import { config } from 'dotenv';
config({ path: resolve(__dirname, '..', '.env.local') });
register({ baseUrl: resolve(__dirname, '..'), paths: { '@/*': ['./src/*'] } });

import { getAIProvider } from '@/lib/ai/provider';
import { generateCarousel } from '@/lib/pipeline/carousel-pipeline';
import { GeneratedHook } from '@/lib/validation/schemas';
import type { GeneratedSlideV2, CompressedSlideDisplay } from '@/lib/validation/schemas';
import { runCopyQualityGate } from '@/lib/pipeline/steps/copy-quality-gate';
import { runNarrativeCoherenceGate } from '@/lib/pipeline/steps/narrative-coherence-gate';
import { runHookPromiseGate } from '@/lib/pipeline/steps/hook-promise-gate';
import { runPreRenderGate, runApprovalGate } from '@/lib/validation/carousel-enforcement';
import { validateRoleContent } from '@/lib/validation/role-content-validator';
import { auditPromptStyle } from '@/lib/validation/style-validator';
import { extractVisualAttributes, quickVisualTruthCheck } from '@/lib/validation/visual-truth-validator';
import { buildSlidePrompt } from '@/lib/visual/prompt-builder';

// ─── Helpers ────────────────────────────────────────────────────

function enforce6SlideStructure(
  slides: GeneratedSlideV2[],
  compressedSlides: CompressedSlideDisplay[],
): { slides: GeneratedSlideV2[]; compressedSlides: CompressedSlideDisplay[] } {
  const normalized = slides.map(s => ({
    ...s,
    role: s.role === 'IMPLICATION' ? 'FACT' : s.role,
  }));
  const opener = normalized.find(s => s.role === 'OPENER');
  const cta = normalized.find(s => s.role === 'CTA');
  let facts = normalized.filter(s => s.role === 'FACT');
  if (!opener || !cta) return { slides: normalized, compressedSlides };
  if (facts.length > 4) facts = facts.slice(0, 4);
  while (facts.length < 4) {
    const source = facts[facts.length - 1] || opener;
    facts.push({ ...source, slideNumber: facts.length + 1, role: 'FACT' });
  }
  const result: GeneratedSlideV2[] = [
    { ...opener, slideNumber: 0 },
    ...facts.map((f, i) => ({ ...f, slideNumber: i + 1 })),
    { ...cta, slideNumber: 5 },
  ];
  const newCompressed: CompressedSlideDisplay[] = result.map(s => {
    const original = compressedSlides.find(c => c.slideNumber === s.slideNumber);
    return original || { slideNumber: s.slideNumber, displayTitle: s.headline?.slice(0, 60) || '', displaySupport: s.body?.slice(0, 80) || '' };
  });
  return { slides: result, compressedSlides: newCompressed };
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  const topic = 'greek gods';

  console.log('\n' + '█'.repeat(60));
  console.log('  GREEK GODS RERUN — Full pipeline with enforcement');
  console.log('█'.repeat(60));

  const ai = getAIProvider();
  console.log(`  Provider: ${ai.providerName} / ${ai.modelName}\n`);

  const start = Date.now();

  // ── 1. Hook ────────────────────────────────────────────────
  console.log('═══ STEP 1: HOOK GENERATION ═══');
  const { data: hook } = await ai.generateObject(
    `You are a viral Instagram carousel content creator.\n\nGiven this topic: "${topic}"\n\nGenerate a single punchy, curiosity-driven hook headline for a fact-based carousel. The hook should create a curiosity gap and make people stop scrolling.\n\nReturn JSON: { "text": "...", "type": "HIDDEN_TRUTH" }\ntype must be one of: CONTRARIAN, CALL_OUT, MISTAKE_EXPOSURE, HIDDEN_TRUTH`,
    GeneratedHook,
  );
  console.log(`  Original hook: "${hook.text}" (${hook.type})\n`);

  // ── 2. Pipeline ────────────────────────────────────────────
  console.log('═══ STEP 2: CAROUSEL PIPELINE ═══');
  const pipelineResult = await generateCarousel(
    { topic, hook: { text: hook.text, type: hook.type } },
    ai,
  );
  const finalHookUsed = pipelineResult.carousel.slides.find(s => s.role === 'OPENER')?.headline || hook.text;

  console.log(`\n  Pipeline complete:`);
  console.log(`    Mode: ${pipelineResult.mode}`);
  console.log(`    Concept: "${pipelineResult.concept}"`);
  console.log(`    Validation: ${pipelineResult.validation.passed ? 'PASSED' : 'FAILED'} (score ${pipelineResult.validation.score})`);
  console.log(`    Hard fails: ${pipelineResult.validation.hardFails.length}`);
  console.log(`    Soft flags: ${pipelineResult.validation.softFlags.length}`);
  console.log(`    Patched slides: ${pipelineResult.patchedSlideIndices.length > 0 ? pipelineResult.patchedSlideIndices.join(', ') : 'none'}`);
  if (pipelineResult.fallback) {
    console.log(`    Fallback: ${pipelineResult.fallback.level} — ${pipelineResult.fallback.reason}`);
  }

  // Hook revision
  if (finalHookUsed !== hook.text) {
    console.log(`\n  ✏️  Hook was revised by pipeline:`);
    console.log(`    Before: "${hook.text}"`);
    console.log(`    After:  "${finalHookUsed}"`);
  }

  // ── 3. Enforce structure ───────────────────────────────────
  console.log('\n═══ STEP 3: ENFORCE 6-SLIDE STRUCTURE ═══');
  const enforced = enforce6SlideStructure(pipelineResult.carousel.slides, pipelineResult.compressedSlides);
  console.log(`  ${enforced.slides.length} slides: ${enforced.slides.map(s => s.role).join(', ')}`);

  // ── 4. Quality gates ───────────────────────────────────────
  console.log('\n═══ STEP 4: COPY QUALITY GATE ═══');
  const qg = await runCopyQualityGate(enforced.slides, enforced.compressedSlides, topic, finalHookUsed, ai);
  console.log(`  Issues found: ${qg.issues.length}`);
  console.log(`  Slides rewritten: ${qg.rewriteCount}`);
  for (const issue of qg.issues) {
    console.log(`    S${issue.slideIndex + 1}: ${issue.issue} — ${issue.detail.slice(0, 80)}`);
  }

  console.log('\n═══ STEP 5: NARRATIVE COHERENCE GATE ═══');
  const ng = await runNarrativeCoherenceGate(qg.slides, qg.compressedSlides, topic, finalHookUsed, ai);
  console.log(`  Issues found: ${ng.issues.length}`);
  console.log(`  Slides rewritten: ${ng.rewriteCount}`);
  console.log(`  Reorder applied: ${ng.reorderApplied}`);
  for (const issue of ng.issues) {
    console.log(`    ${issue.type}: ${issue.detail.slice(0, 80)}`);
  }

  console.log('\n═══ STEP 6: HOOK-PROMISE GATE ═══');
  const hpg = await runHookPromiseGate(ng.slides, ng.compressedSlides, topic, finalHookUsed, ai);
  console.log(`  Action: ${hpg.action}`);
  console.log(`  Rewrites: ${hpg.rewriteCount}`);
  for (const issue of hpg.issues) {
    console.log(`    ${issue.type}: ${issue.detail.slice(0, 80)}`);
  }

  const finalSlides = hpg.slides;
  const finalCompressed = hpg.compressedSlides;

  // ── 5. Enforcement gate ────────────────────────────────────
  console.log('\n═══ STEP 7: ENFORCEMENT GATE ═══');

  // Build image prompts for style audit
  const { detectTopic: _detectDomain } = await import('@/lib/visual/intent');
  const topicDomain = _detectDomain({ slideRole: 'FACT', topic });

  const imagePrompts: Array<{ slideIndex: number; prompt: string; topicDomain: string }> = [];
  for (const slide of finalSlides) {
    try {
      const compressed = finalCompressed.find(c => c.slideNumber === slide.slideNumber);
      const po = buildSlidePrompt({
        slideRole: slide.role === 'OPENER' ? 'HOOK' : slide.role,
        subject: slide.topicEntity || topic,
        topic,
        headlineText: compressed?.displayTitle || slide.headline,
        bodyText: compressed?.displaySupport || '',
      });
      imagePrompts.push({ slideIndex: slide.slideNumber, prompt: po.imagePrompt, topicDomain });
    } catch (e) {
      console.warn(`    [warn] Prompt build failed for slide ${slide.slideNumber}`);
    }
  }

  const preRender = runPreRenderGate(finalSlides, imagePrompts);
  console.log(`  Pre-render gate: ${preRender.passed ? '✅ PASSED' : '❌ FAILED'}`);
  for (const f of preRender.failures) {
    console.log(`    S${f.slideIndex + 1} [${f.category}] ${f.rule}: ${f.detail.slice(0, 70)}`);
  }
  if (preRender.ctaFailures.length > 0) {
    console.log(`  CTA auto-regen would be triggered: YES (${preRender.ctaFailures.length} CTA failures)`);
  }

  // Role-content details
  const rcReport = validateRoleContent(finalSlides);
  console.log(`\n  Role-content: ${rcReport.passed ? '✅ PASSED' : `❌ ${rcReport.failures.length} failure(s)`}`);
  for (const f of rcReport.failures) {
    console.log(`    S${f.slideIndex + 1} (${f.role}): ${f.rule} — ${f.detail.slice(0, 70)}`);
  }

  // Style audit per slide
  console.log(`\n  Style audit (domain: ${topicDomain}):`);
  let totalStyleViolations = 0;
  for (const ip of imagePrompts) {
    const sa = auditPromptStyle(ip.prompt, ip.topicDomain);
    if (sa.violations.length > 0) {
      totalStyleViolations += sa.violations.length;
      for (const v of sa.violations) {
        console.log(`    S${ip.slideIndex + 1} [${v.severity}] ${v.element}`);
      }
    }
  }
  if (totalStyleViolations === 0) {
    console.log(`    ✅ No style violations`);
  }

  // Visual truth
  console.log(`\n  Visual truth check:`);
  let totalMismatches = 0;
  for (let i = 0; i < finalSlides.length; i++) {
    const slide = finalSlides[i];
    const attrs = extractVisualAttributes(slide.headline, slide.body, slide.topicEntity || undefined);
    if (attrs.length > 0) {
      console.log(`    S${slide.slideNumber + 1}: ${attrs.length} attribute(s) — ${attrs.map(a => `[${a.priority}] ${a.claim}`).join(', ')}`);
      const ip = imagePrompts.find(p => p.slideIndex === slide.slideNumber);
      if (ip && attrs.some(a => a.priority === 'high')) {
        const vtc = quickVisualTruthCheck(slide.headline, slide.body, ip.prompt);
        if (!vtc.passed) {
          totalMismatches += vtc.mismatches.length;
          for (const m of vtc.mismatches) console.log(`      ❌ ${m}`);
        } else {
          console.log(`      ✅ All high-priority attributes present in prompt`);
        }
      }
    }
  }
  if (totalMismatches === 0) {
    console.log(`    ✅ No prompt mismatches`);
  }

  // Approval gate
  console.log('\n═══ STEP 8: APPROVAL GATE ═══');
  const approval = runApprovalGate(finalSlides);
  console.log(`  Approval: ${approval.approved ? '✅ ALLOWED' : '❌ BLOCKED'}`);
  console.log(`  Passed: ${approval.summary.passedSlides}/${approval.summary.totalSlides}`);
  if (!approval.approved) {
    for (const f of approval.failures) {
      console.log(`    S${f.slideIndex + 1} [${f.category}] ${f.rule}`);
    }
  }

  // ── Final carousel dump ────────────────────────────────────
  console.log('\n' + '█'.repeat(60));
  console.log('  FINAL CAROUSEL');
  console.log('█'.repeat(60));

  for (const slide of finalSlides) {
    const compressed = finalCompressed.find(c => c.slideNumber === slide.slideNumber);
    console.log(`\n  ── Slide ${slide.slideNumber + 1}: ${slide.role} ──`);
    console.log(`  Headline: ${slide.headline}`);
    if (slide.body) {
      console.log(`  Body (${slide.body.length} chars): ${slide.body}`);
    }
    if (slide.supportingDetail) {
      console.log(`  Source: ${slide.supportingDetail}`);
    }
    if (slide.factType) console.log(`  Type: ${slide.factType}`);
    if (slide.topicEntity) console.log(`  Entity: ${slide.topicEntity}`);
    if (compressed) {
      console.log(`  Display: "${compressed.displayTitle}" / "${compressed.displaySupport}"`);
    }
  }

  // ── Summary ────────────────────────────────────────────────
  const totalRewrites = qg.rewriteCount + ng.rewriteCount + hpg.rewriteCount;
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log('\n' + '█'.repeat(60));
  console.log('  SUMMARY');
  console.log('█'.repeat(60));
  console.log(`\n  Topic: ${topic}`);
  console.log(`  Angle: ${pipelineResult.mode} / "${pipelineResult.concept}"`);
  console.log(`  Hook: "${finalHookUsed}"`);
  console.log(`  Pipeline score: ${pipelineResult.validation.score}/100`);
  console.log(`  Total rewrites: ${totalRewrites} (quality=${qg.rewriteCount} narrative=${ng.rewriteCount} hook=${hpg.rewriteCount})`);
  console.log(`  Style violations: ${totalStyleViolations}`);
  console.log(`  Prompt mismatches: ${totalMismatches}`);
  console.log(`  Enforcement: ${preRender.passed ? 'PASSED' : 'FAILED'}`);
  console.log(`  Approval: ${approval.approved ? 'ALLOWED' : 'BLOCKED'}`);
  console.log(`  Duration: ${elapsed}s\n`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
