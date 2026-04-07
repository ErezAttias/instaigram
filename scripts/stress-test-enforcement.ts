/**
 * Stress Test — Real LLM generation with enforcement validation.
 *
 * Runs 5 topics through the REAL pipeline (OpenAI LLM) and validates
 * all enforcement layers. Skips image rendering (expensive/slow) but
 * tests everything up to and including the pre-render enforcement gate.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/stress-test-enforcement.ts
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
import { runPreRenderGate } from '@/lib/validation/carousel-enforcement';
import { validateRoleContent } from '@/lib/validation/role-content-validator';
import { auditPromptStyle } from '@/lib/validation/style-validator';
import { extractVisualAttributes, quickVisualTruthCheck } from '@/lib/validation/visual-truth-validator';
import { buildSlidePrompt } from '@/lib/visual/prompt-builder';

// ─── Types ──────────────────────────────────────────────────────

interface TopicTestResult {
  topic: string;
  completed: boolean;
  error?: string;
  hookText?: string;
  mode?: string;
  concept?: string;
  slideCount: number;
  slides: Array<{
    index: number;
    role: string;
    headline: string;
    bodyLength: number;
    factType: string | null;
    topicEntity: string | null;
  }>;
  pipelineValidation: {
    passed: boolean;
    score: number;
    hardFails: number;
    softFlags: number;
  };
  qualityGate: {
    issuesFound: number;
    slidesRewritten: number;
    issues: string[];
  };
  narrativeGate: {
    issuesFound: number;
    slidesRewritten: number;
    reorderApplied: boolean;
  };
  hookPromiseGate: {
    action: string;
    rewriteCount: number;
  };
  enforcement: {
    preRenderPassed: boolean;
    failures: Array<{ slide: number; category: string; rule: string; detail: string }>;
    ctaAutoRegenNeeded: boolean;
  };
  roleContent: {
    passed: boolean;
    failures: Array<{ slide: number; role: string; rule: string }>;
  };
  styleAudit: {
    totalSlides: number;
    violations: Array<{ slide: number; element: string; severity: string }>;
  };
  visualTruth: {
    attributesExtracted: number;
    promptMismatches: string[];
  };
  durationMs: number;
}

// ─── Enforce 6-Slide Structure (copied from service) ────────────

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
    return original || {
      slideNumber: s.slideNumber,
      displayTitle: s.headline?.slice(0, 60) || '',
      displaySupport: s.body?.slice(0, 80) || '',
    };
  });

  return { slides: result, compressedSlides: newCompressed };
}

// ─── Detect Topic Domain ────────────────────────────────────────

function detectTopicDomain(topic: string): string {
  const t = topic.toLowerCase();
  if (/myth|god|zeus|athena|olymp|cerberus|mythology/.test(t)) return 'mythology';
  if (/history|ancient|rome|roman|medieval|empire/.test(t)) return 'history';
  if (/animal|species|wildlife|creature/.test(t)) return 'animals';
  if (/space|nasa|rocket|planet|mars|moon|orbit/.test(t)) return 'science';
  if (/mindset|success|habit|productivity|growth/.test(t)) return 'psychology';
  return 'general';
}

// ─── Run Single Topic ───────────────────────────────────────────

async function runTopic(topic: string, ai: ReturnType<typeof getAIProvider>): Promise<TopicTestResult> {
  const start = Date.now();
  const result: TopicTestResult = {
    topic,
    completed: false,
    slideCount: 0,
    slides: [],
    pipelineValidation: { passed: false, score: 0, hardFails: 0, softFlags: 0 },
    qualityGate: { issuesFound: 0, slidesRewritten: 0, issues: [] },
    narrativeGate: { issuesFound: 0, slidesRewritten: 0, reorderApplied: false },
    hookPromiseGate: { action: 'none', rewriteCount: 0 },
    enforcement: { preRenderPassed: false, failures: [], ctaAutoRegenNeeded: false },
    roleContent: { passed: false, failures: [] },
    styleAudit: { totalSlides: 0, violations: [] },
    visualTruth: { attributesExtracted: 0, promptMismatches: [] },
    durationMs: 0,
  };

  try {
    // ── 1. Generate hook ─────────────────────────────────
    console.log(`  [1/7] Generating hook...`);
    const { data: hook } = await ai.generateObject(
      `You are a viral Instagram carousel content creator.\n\nGiven this topic: "${topic}"\n\nGenerate a single punchy, curiosity-driven hook headline for a fact-based carousel. The hook should create a curiosity gap and make people stop scrolling.\n\nReturn JSON: { "text": "...", "type": "HIDDEN_TRUTH" }\ntype must be one of: CONTRARIAN, CALL_OUT, MISTAKE_EXPOSURE, HIDDEN_TRUTH`,
      GeneratedHook,
    );
    result.hookText = hook.text;
    console.log(`  Hook: "${hook.text}"`);

    // ── 2. Run pipeline ──────────────────────────────────
    console.log(`  [2/7] Running carousel pipeline...`);
    const pipelineResult = await generateCarousel(
      { topic, hook: { text: hook.text, type: hook.type } },
      ai,
    );
    result.mode = pipelineResult.mode;
    result.concept = pipelineResult.concept;
    result.pipelineValidation = {
      passed: pipelineResult.validation.passed,
      score: pipelineResult.validation.score,
      hardFails: pipelineResult.validation.hardFails.length,
      softFlags: pipelineResult.validation.softFlags.length,
    };

    // ── 3. Enforce 6-slide ───────────────────────────────
    console.log(`  [3/7] Enforcing structure...`);
    const enforced = enforce6SlideStructure(
      pipelineResult.carousel.slides,
      pipelineResult.compressedSlides,
    );

    // ── 4. Quality gates ─────────────────────────────────
    console.log(`  [4/7] Copy quality gate...`);
    const qg = await runCopyQualityGate(
      enforced.slides, enforced.compressedSlides, topic, hook.text, ai,
    );
    result.qualityGate = {
      issuesFound: qg.issues.length,
      slidesRewritten: qg.rewriteCount,
      issues: qg.issues.map(i => `S${i.slideIndex + 1}:${i.issue}`),
    };

    console.log(`  [5/7] Narrative coherence gate...`);
    const ng = await runNarrativeCoherenceGate(
      qg.slides, qg.compressedSlides, topic, hook.text, ai,
    );
    result.narrativeGate = {
      issuesFound: ng.issues.length,
      slidesRewritten: ng.rewriteCount,
      reorderApplied: ng.reorderApplied,
    };

    console.log(`  [6/7] Hook promise gate...`);
    const hpg = await runHookPromiseGate(
      ng.slides, ng.compressedSlides, topic, hook.text, ai,
    );
    result.hookPromiseGate = {
      action: hpg.action,
      rewriteCount: hpg.rewriteCount,
    };

    const finalSlides = hpg.slides;
    const finalCompressed = hpg.compressedSlides;

    // ── 5. Record slide data ─────────────────────────────
    result.slideCount = finalSlides.length;
    result.slides = finalSlides.map(s => ({
      index: s.slideNumber,
      role: s.role,
      headline: s.headline,
      bodyLength: s.body.length,
      factType: s.factType,
      topicEntity: s.topicEntity,
    }));

    // ── 6. Enforcement gate ──────────────────────────────
    console.log(`  [7/7] Enforcement gate...`);

    // Role-content
    const rcReport = validateRoleContent(finalSlides);
    result.roleContent = {
      passed: rcReport.passed,
      failures: rcReport.failures.map(f => ({
        slide: f.slideIndex + 1,
        role: f.role,
        rule: f.rule,
      })),
    };

    // Style audit — build prompts and check
    const topicDomain = detectTopicDomain(topic);
    let styleViolations: TopicTestResult['styleAudit']['violations'] = [];
    let allMismatches: string[] = [];
    let totalAttributes = 0;

    for (const slide of finalSlides) {
      try {
        const compressed = finalCompressed.find(c => c.slideNumber === slide.slideNumber);
        const displayTitle = compressed?.displayTitle || slide.headline;
        const displaySupport = compressed?.displaySupport || '';

        const promptOutput = buildSlidePrompt({
          slideRole: slide.role === 'OPENER' ? 'HOOK' : slide.role,
          subject: slide.topicEntity || topic,
          topic,
          headlineText: displayTitle,
          bodyText: displaySupport,
        });

        // Style audit
        const sa = auditPromptStyle(promptOutput.imagePrompt, topicDomain);
        for (const v of sa.violations) {
          styleViolations.push({
            slide: slide.slideNumber + 1,
            element: v.element,
            severity: v.severity,
          });
        }

        // Visual truth
        const attrs = extractVisualAttributes(slide.headline, slide.body, slide.topicEntity || undefined);
        totalAttributes += attrs.length;

        if (attrs.filter(a => a.priority === 'high').length > 0) {
          const vtCheck = quickVisualTruthCheck(slide.headline, slide.body, promptOutput.imagePrompt);
          if (!vtCheck.passed) {
            allMismatches.push(...vtCheck.mismatches.map(m => `S${slide.slideNumber + 1}: ${m}`));
          }
        }
      } catch (promptErr) {
        // Some slides may not have valid templates — log and continue
        console.warn(`    [warn] Prompt build failed for slide ${slide.slideNumber}: ${promptErr}`);
      }
    }

    result.styleAudit = {
      totalSlides: finalSlides.length,
      violations: styleViolations,
    };
    result.visualTruth = {
      attributesExtracted: totalAttributes,
      promptMismatches: allMismatches,
    };

    // Full pre-render gate
    const preRender = runPreRenderGate(finalSlides);
    result.enforcement = {
      preRenderPassed: preRender.passed,
      failures: preRender.failures.map(f => ({
        slide: f.slideIndex + 1,
        category: f.category,
        rule: f.rule,
        detail: f.detail,
      })),
      ctaAutoRegenNeeded: preRender.ctaFailures.length > 0,
    };

    result.completed = true;
  } catch (err) {
    result.error = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300);
  }

  result.durationMs = Date.now() - start;
  return result;
}

// ─── Report Printer ─────────────────────────────────────────────

function printReport(r: TopicTestResult, index: number) {
  const bar = '─'.repeat(58);
  console.log(`\n┌${bar}┐`);
  console.log(`│  TEST ${index}: ${r.topic.padEnd(48)}│`);
  console.log(`├${bar}┤`);

  if (!r.completed) {
    console.log(`│  ❌ FAILED TO COMPLETE                                    │`);
    console.log(`│  Error: ${(r.error || 'unknown').slice(0, 48).padEnd(48)}│`);
    console.log(`└${bar}┘`);
    return;
  }

  // Basic info
  console.log(`│  Hook: ${(r.hookText || '').slice(0, 49).padEnd(49)}│`);
  console.log(`│  Mode: ${(r.mode || '').padEnd(15)} Concept: ${(r.concept || '').slice(0, 27).padEnd(27)}│`);
  console.log(`│  Slides: ${r.slideCount}    Duration: ${(r.durationMs / 1000).toFixed(1)}s`.padEnd(59) + '│');

  // Slides
  console.log(`├${bar}┤`);
  console.log(`│  SLIDES:`.padEnd(59) + '│');
  for (const s of r.slides) {
    const hl = s.headline.slice(0, 45);
    console.log(`│    ${s.index}. [${s.role.padEnd(6)}] ${hl}`.padEnd(59) + '│');
  }

  // Pipeline validation
  console.log(`├${bar}┤`);
  const pv = r.pipelineValidation;
  console.log(`│  PIPELINE: ${pv.passed ? '✅ PASS' : '❌ FAIL'} score=${pv.score} hard=${pv.hardFails} soft=${pv.softFlags}`.padEnd(59) + '│');

  // Quality gates
  const qg = r.qualityGate;
  const ng = r.narrativeGate;
  const hpg = r.hookPromiseGate;
  const totalRewrites = qg.slidesRewritten + ng.slidesRewritten + hpg.rewriteCount;
  console.log(`│  GATES: quality=${qg.issuesFound}→${qg.slidesRewritten}rw  narrative=${ng.issuesFound}→${ng.slidesRewritten}rw  hook=${hpg.action}`.padEnd(59) + '│');
  if (qg.issues.length > 0) {
    for (const issue of qg.issues.slice(0, 3)) {
      console.log(`│    ${issue.slice(0, 54)}`.padEnd(59) + '│');
    }
  }

  // Enforcement
  console.log(`├${bar}┤`);
  const enf = r.enforcement;
  console.log(`│  ENFORCEMENT: ${enf.preRenderPassed ? '✅ PASS' : '❌ FAIL'}  CTA-regen=${enf.ctaAutoRegenNeeded ? 'YES' : 'no'}`.padEnd(59) + '│');
  if (enf.failures.length > 0) {
    for (const f of enf.failures) {
      console.log(`│    S${f.slide} [${f.category}] ${f.rule.slice(0, 37)}`.padEnd(59) + '│');
    }
  }

  // Role-content
  const rc = r.roleContent;
  console.log(`│  ROLE-CONTENT: ${rc.passed ? '✅ PASS' : `❌ ${rc.failures.length} failure(s)`}`.padEnd(59) + '│');
  for (const f of rc.failures) {
    console.log(`│    S${f.slide} (${f.role}): ${f.rule.slice(0, 40)}`.padEnd(59) + '│');
  }

  // Style
  const sa = r.styleAudit;
  const hardStyle = sa.violations.filter(v => v.severity === 'hard');
  console.log(`│  STYLE: ${sa.violations.length} violation(s) (${hardStyle.length} hard)`.padEnd(59) + '│');
  for (const v of sa.violations.slice(0, 3)) {
    console.log(`│    S${v.slide} [${v.severity}] ${v.element.slice(0, 40)}`.padEnd(59) + '│');
  }

  // Visual truth
  const vt = r.visualTruth;
  console.log(`│  VISUAL-TRUTH: ${vt.attributesExtracted} attrs, ${vt.promptMismatches.length} mismatch(es)`.padEnd(59) + '│');
  for (const m of vt.promptMismatches.slice(0, 3)) {
    console.log(`│    ${m.slice(0, 54)}`.padEnd(59) + '│');
  }

  // Regens
  console.log(`├${bar}┤`);
  console.log(`│  TOTAL REGENERATIONS: ${totalRewrites} (quality=${qg.slidesRewritten} narrative=${ng.slidesRewritten} hook=${hpg.rewriteCount})`.padEnd(59) + '│');
  console.log(`└${bar}┘`);
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  const topics = [
    'Myths people get wrong about Zeus',
    'Animals that look dangerous but aren\'t',
    'Ancient Rome daily life',
    'Success mindset',
    'Space exploration facts',
  ];

  console.log('\n' + '█'.repeat(60));
  console.log('  ENFORCEMENT STRESS TEST — 5 REAL LLM TOPICS');
  console.log('  Using OpenAI GPT-4o with full pipeline');
  console.log('█'.repeat(60));

  const ai = getAIProvider();
  console.log(`\n  Provider: ${ai.providerName} / ${ai.modelName}\n`);

  const results: TopicTestResult[] = [];

  for (let i = 0; i < topics.length; i++) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  TOPIC ${i + 1}/5: ${topics[i]}`);
    console.log('═'.repeat(60));

    const result = await runTopic(topics[i], ai);
    results.push(result);
    printReport(result, i + 1);
  }

  // ─── Summary ────────────────────────────────────────────────

  console.log('\n' + '█'.repeat(60));
  console.log('  AGGREGATE SUMMARY');
  console.log('█'.repeat(60));

  const completed = results.filter(r => r.completed);
  const failed = results.filter(r => !r.completed);
  const enforcementPassed = results.filter(r => r.enforcement.preRenderPassed);
  const enforcementFailed = results.filter(r => !r.enforcement.preRenderPassed && r.completed);
  const ctaRegensNeeded = results.filter(r => r.enforcement.ctaAutoRegenNeeded);
  const totalRewrites = results.reduce((sum, r) =>
    sum + r.qualityGate.slidesRewritten + r.narrativeGate.slidesRewritten + r.hookPromiseGate.rewriteCount, 0);
  const totalStyleViolations = results.reduce((sum, r) => sum + r.styleAudit.violations.length, 0);
  const totalPromptMismatches = results.reduce((sum, r) => sum + r.visualTruth.promptMismatches.length, 0);

  console.log(`\n  Completed:             ${completed.length}/5`);
  console.log(`  Failed to generate:    ${failed.length}/5`);
  console.log(`  Enforcement PASS:      ${enforcementPassed.length}/5`);
  console.log(`  Enforcement FAIL:      ${enforcementFailed.length}/5`);
  console.log(`  CTA auto-regen needed: ${ctaRegensNeeded.length}/5`);
  console.log(`  Total slide rewrites:  ${totalRewrites}`);
  console.log(`  Style violations:      ${totalStyleViolations}`);
  console.log(`  Prompt mismatches:     ${totalPromptMismatches}`);

  // Collect all enforcement failures across all topics
  const allEnfFailures = results.flatMap(r =>
    r.enforcement.failures.map(f => ({ topic: r.topic, ...f }))
  );
  const allRCFailures = results.flatMap(r =>
    r.roleContent.failures.map(f => ({ topic: r.topic, ...f }))
  );

  if (allEnfFailures.length > 0) {
    console.log(`\n  ALL ENFORCEMENT FAILURES:`);
    for (const f of allEnfFailures) {
      console.log(`    [${f.topic.slice(0, 25)}] S${f.slide} ${f.category}/${f.rule}`);
    }
  }

  if (allRCFailures.length > 0) {
    console.log(`\n  ALL ROLE-CONTENT FAILURES:`);
    for (const f of allRCFailures) {
      console.log(`    [${f.topic.slice(0, 25)}] S${f.slide} (${f.role}) ${f.rule}`);
    }
  }

  // Quality assessment
  console.log(`\n  ── SUBJECTIVE QUALITY NOTES ──`);
  for (const r of completed) {
    const ctaSlide = r.slides.find(s => s.role === 'CTA');
    const factSlides = r.slides.filter(s => s.role === 'FACT');
    const hasVagueFact = factSlides.some(s =>
      /duality|balance|energy|power|harmony|essence/i.test(s.headline)
    );
    const ctaHasVerb = ctaSlide ? /\b(save|follow|share|comment|learn|discover|explore|swipe|tap|check|grab|join|try|read|watch)\b/i.test(ctaSlide.headline) : false;
    const avgBodyLen = factSlides.reduce((s, f) => s + f.bodyLength, 0) / Math.max(factSlides.length, 1);

    console.log(`\n    ${r.topic}:`);
    console.log(`      CTA has action verb:  ${ctaHasVerb ? '✅' : '❌'} "${ctaSlide?.headline.slice(0, 50)}"`);
    console.log(`      Vague fact headlines:  ${hasVagueFact ? '❌ YES' : '✅ None'}`);
    console.log(`      Avg FACT body length:  ${Math.round(avgBodyLen)} chars ${avgBodyLen >= 200 ? '✅' : '⚠️ short'}`);
    console.log(`      Unique topicEntities:  ${new Set(factSlides.map(f => f.topicEntity)).size}/${factSlides.length}`);
  }

  console.log(`\n  Total time: ${(results.reduce((s, r) => s + r.durationMs, 0) / 1000).toFixed(1)}s\n`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
