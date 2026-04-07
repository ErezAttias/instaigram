/**
 * Generate Variations — Visual Engine Consistency Sandbox
 *
 * Generates N image variations from the same input by varying:
 *   1. Intent tension (threat / contrast / transformation)
 *   2. Distortion type (reflection-mismatch / physical-inconsistency / temporal-tension)
 *   3. Composition framing (close-up / mid-shot / wide)
 *
 * v3: Adds distortion relevance scoring. Each variation is evaluated for:
 *   - Visual strength (how noticeable)
 *   - Semantic relevance (does it reinforce the headline's meaning)
 *   - Uniqueness (how different from others in the batch)
 *
 * Variations where the distortion is eye-catching but not meaningfully tied
 * to the headline are rejected. Only images where the distortion acts as a
 * visual argument — not a random anomaly — are generated.
 *
 * Usage:
 *   npx tsx scripts/generate-variations.ts
 *   npx tsx scripts/generate-variations.ts --topic tech --headline "AI will replace your job" --subject "software engineer" --variations 9
 *   npx tsx scripts/generate-variations.ts --skip-rejected   # generate all, but mark rejected
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'fs';
import path from 'path';
import { buildVisualIntent, detectTopic, extractHeadlineTension } from '../src/lib/visual/intent';
import type { VisualIntent, HeadlineTension, TopicDomain } from '../src/lib/visual/intent';
import { TOPIC_DISTORTIONS, type DistortionType, type Distortion } from '../src/lib/visual/distortion';
import { applyStyleLock } from '../src/lib/visual/style-lock';
import { LIGHTING_RULES, BACKGROUND_RULES, IMAGE_CONSTRAINTS } from '../src/lib/visual/system';
import { getTemplatesForRole } from '../src/lib/visual/templates';
import { getUnifiedImageProvider } from '../src/lib/ai/image-provider';
import {
  scoreDistortionRelevance,
  rankVariations,
  ACCEPTANCE_THRESHOLD,
  type RelevanceScore,
  type RelevanceInput,
} from '../src/lib/visual/distortion-relevance';

// ─── Variation Axes ─────────────────────────────────────────────

const INTENT_TENSIONS: HeadlineTension['type'][] = ['threat', 'contrast', 'transformation'];

const DISTORTION_TYPES: DistortionType[] = [
  'reflection-mismatch',
  'physical-inconsistency',
  'temporal-tension',
];

interface CompositionFraming {
  name: string;
  subjectModifier: string;
  cameraDirective: string;
}

const COMPOSITION_FRAMINGS: CompositionFraming[] = [
  {
    name: 'close-up',
    subjectModifier: 'extreme close-up of',
    cameraDirective: 'macro lens, f/1.8 shallow depth of field, subject fills frame, intimate detail, pores and textures visible',
  },
  {
    name: 'mid-shot',
    subjectModifier: '',
    cameraDirective: '85mm portrait lens, f/2.8, waist-up framing, three-quarter view, environmental context visible behind subject',
  },
  {
    name: 'wide',
    subjectModifier: '',
    cameraDirective: '24mm wide-angle, f/8 deep depth of field, full body, subject dwarfed by environment, vast dark space around them',
  },
];

const TENSION_HEADLINE_REWRITES: Record<HeadlineTension['type'], (h: string) => string> = {
  threat:         (h) => `This will destroy everything — ${h}`,
  contrast:       (h) => `${h} — but the opposite is also true`,
  transformation: (h) => `How to transform and unlock: ${h}`,
  revelation:     (h) => `The hidden secret: ${h}`,
  challenge:      (h) => `You're wrong about this — ${h}`,
  neutral:        (h) => h,
};

// ─── Configuration ──────────────────────────────────────────────

interface VariationConfig {
  topic: string;
  slideRole: string;
  headline: string;
  subject: string;
  variations: number;
  skipRejected: boolean;
}

// ─── Variation Result ───────────────────────────────────────────

interface VariationResult {
  index: number;
  intentTension: string;
  distortionType: string;
  compositionFraming: string;
  detectedTension: string;
  prompt: string;
  negativePrompt: string;
  intentScene: string;
  distortionText: string;
  imagePath: string | null;
  score: RelevanceScore;
  error?: string;
}

// ─── CLI Parsing ────────────────────────────────────────────────

function parseArgs(): VariationConfig {
  const args = process.argv.slice(2);
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--skip-rejected') {
      flags['skipRejected'] = 'true';
    } else if (args[i].startsWith('--') && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[++i];
    }
  }
  return {
    topic: flags.topic ?? 'tech',
    slideRole: flags.slideRole ?? flags.role ?? 'HOOK',
    headline: flags.headline ?? 'AI will never replace you',
    subject: flags.subject ?? 'a software engineer standing in a dark server room corridor',
    variations: Math.min(parseInt(flags.variations ?? '9', 10), 27),
    skipRejected: flags.skipRejected === 'true',
  };
}

// ─── Variation Matrix (maximally diverse interleaving) ──────────

interface VariationAxis {
  intentTension: HeadlineTension['type'];
  distortionType: DistortionType;
  compositionFraming: CompositionFraming;
}

function buildVariationMatrix(count: number): VariationAxis[] {
  const matrix: VariationAxis[] = [];
  for (const tension of INTENT_TENSIONS) {
    for (const distortion of DISTORTION_TYPES) {
      for (const framing of COMPOSITION_FRAMINGS) {
        matrix.push({ intentTension: tension, distortionType: distortion, compositionFraming: framing });
      }
    }
  }

  const selected: VariationAxis[] = [];
  const used = new Set<number>();
  const axisCounts = { tension: {} as Record<string, number>, distortion: {} as Record<string, number>, framing: {} as Record<string, number> };

  for (let pick = 0; pick < Math.min(count, matrix.length); pick++) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    const prev = selected.length > 0 ? selected[selected.length - 1] : null;

    for (let i = 0; i < matrix.length; i++) {
      if (used.has(i)) continue;
      const c = matrix[i];
      let diffScore = 0;
      if (!prev) { diffScore = 3; }
      else {
        if (c.intentTension !== prev.intentTension) diffScore++;
        if (c.distortionType !== prev.distortionType) diffScore++;
        if (c.compositionFraming.name !== prev.compositionFraming.name) diffScore++;
      }
      const usageScore = -(
        (axisCounts.tension[c.intentTension] ?? 0) +
        (axisCounts.distortion[c.distortionType] ?? 0) +
        (axisCounts.framing[c.compositionFraming.name] ?? 0)
      );
      const score = diffScore * 1000 + usageScore;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }

    const chosen = matrix[bestIdx];
    used.add(bestIdx);
    selected.push(chosen);
    axisCounts.tension[chosen.intentTension] = (axisCounts.tension[chosen.intentTension] ?? 0) + 1;
    axisCounts.distortion[chosen.distortionType] = (axisCounts.distortion[chosen.distortionType] ?? 0) + 1;
    axisCounts.framing[chosen.compositionFraming.name] = (axisCounts.framing[chosen.compositionFraming.name] ?? 0) + 1;
  }

  return selected;
}

// ─── Direct Distortion Builder (bypasses deterministic selection) ─

function buildDistortionDirect(
  type: DistortionType,
  topic: TopicDomain,
  headline: string,
  variationIndex: number,
): Distortion {
  const topicVocab = TOPIC_DISTORTIONS[topic] ?? TOPIC_DISTORTIONS.general;
  const variants = topicVocab[type];

  if (!variants || variants.length === 0) {
    const fallback = TOPIC_DISTORTIONS.general[type];
    return {
      type,
      sceneInjection: `THE CENTRAL VISUAL: ${fallback[0]}. This is the first thing the viewer sees.`,
      compositionDirective: getCompositionDirective(type),
      rationale: `forced type=${type} topic=${topic} (fallback to general)`,
    };
  }

  const variant = variants[variationIndex % variants.length];

  return {
    type,
    sceneInjection: `THE CENTRAL VISUAL: ${variant}. This is the first thing the viewer sees. Everything else in the frame exists to support this detail.`,
    compositionDirective: getCompositionDirective(type),
    rationale: `forced type=${type} topic=${topic} variant=${variationIndex % variants.length}/${variants.length}`,
  };
}

function getCompositionDirective(type: DistortionType): string {
  const directives: Record<DistortionType, string> = {
    'physical-inconsistency': 'The inconsistent element is in sharp focus at the center of the frame. The rest of the scene is slightly softer. The eye must hit the wrong detail first.',
    'reflection-mismatch': 'Both the subject and their reflection are in the frame with equal visual weight. The contradiction between them is the composition — the image is split between reality and reflection.',
    'temporal-tension': 'The frozen moment is center-frame with razor-sharp focus. Motion blur radiates outward from the frozen point. Everything else in the scene is secondary to this instant.',
    'scale-imbalance': 'The oversized or undersized element fills the frame aggressively. The subject is composed in direct physical relationship to it.',
  };
  return directives[type];
}

// ─── Direct Prompt Assembler ────────────────────────────────────

function assembleVariationPrompt(
  subject: string,
  intent: VisualIntent,
  distortion: Distortion,
  framing: CompositionFraming,
  templateFragment: string,
  lightingFragment: string,
  backgroundFragment: string,
  moodKeywords: string[],
  styleDirectives: string,
): string {
  const subjectLayer = templateFragment.replace('{subject}', `${framing.subjectModifier} ${subject}`.trim());
  const sceneLayer = `${intent.scene}. ${distortion.sceneInjection}`;
  const intentLayer = `Visual tension: ${intent.tension}. Key visual detail: ${intent.visualHook}`;
  const compositionLayer = `${framing.cameraDirective}. ${distortion.compositionDirective}`;
  const styleLayer = [lightingFragment, backgroundFragment, moodKeywords.join(', ')].join(', ');
  const constraintLayer = `${IMAGE_CONSTRAINTS.aspectRatio} aspect ratio, no text or writing in the image, single subject focus`;

  return [subjectLayer, sceneLayer, compositionLayer, intentLayer, styleLayer, styleDirectives, constraintLayer].join('. ');
}

function assembleNegativePrompt(intent: VisualIntent, styleLockNegatives: string[]): string {
  const seen = new Set<string>();
  return [...IMAGE_CONSTRAINTS.negativePrompt, ...intent.avoid, ...styleLockNegatives]
    .filter(item => { if (seen.has(item)) return false; seen.add(item); return true; })
    .join(', ');
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  const config = parseArgs();
  const role = config.slideRole.toUpperCase();

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Visual Engine — Variation Generator  v3                  ║');
  console.log('║   with Distortion Relevance Scoring                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log(`  Topic:         ${config.topic}`);
  console.log(`  Role:          ${role}`);
  console.log(`  Headline:      ${config.headline}`);
  console.log(`  Subject:       ${config.subject}`);
  console.log(`  Variations:    ${config.variations}`);
  console.log(`  Skip rejected: ${config.skipRejected}\n`);

  const outputDir = path.resolve(__dirname, '..', 'output', 'variations');
  fs.mkdirSync(outputDir, { recursive: true });

  // Resolve shared visual components
  const topicDomain = detectTopic({ slideRole: role, topic: config.topic, headline: config.headline, subject: config.subject });
  const template = getTemplatesForRole(role)[0];
  if (!template) throw new Error(`No template for role "${role}"`);
  const lighting = LIGHTING_RULES.find(l => l.name === template.preferredLighting) ?? LIGHTING_RULES[0];
  const background = BACKGROUND_RULES.find(b => b.name === template.preferredBackground) ?? BACKGROUND_RULES[0];

  console.log(`  Detected topic: ${topicDomain}`);
  console.log(`  Template:       ${template.name}`);
  console.log(`  Lighting:       ${lighting.name}`);
  console.log(`  Background:     ${background.name}`);

  const imageProvider = getUnifiedImageProvider();
  const matrix = buildVariationMatrix(config.variations);

  // ─── Phase 1: Build all distortions and score relevance ─────

  console.log(`\n${'═'.repeat(70)}`);
  console.log('PHASE 1: Distortion Relevance Scoring');
  console.log(`${'═'.repeat(70)}\n`);

  interface ScoredVariation {
    axis: VariationAxis;
    distortion: Distortion;
    intent: VisualIntent;
    modifiedHeadline: string;
    detectedTension: HeadlineTension;
    prompt: string;
    negativePrompt: string;
    styleLockDirectives: string;
    score: RelevanceScore;
  }

  const scoredVariations: ScoredVariation[] = [];

  // First pass: build all distortions
  const allDistortionTexts: Array<{ text: string; type: DistortionType }> = [];
  const preBuilt: Array<{
    axis: VariationAxis;
    distortion: Distortion;
    intent: VisualIntent;
    modifiedHeadline: string;
    detectedTension: HeadlineTension;
    prompt: string;
    negativePrompt: string;
  }> = [];

  for (let i = 0; i < matrix.length; i++) {
    const axis = matrix[i];
    const modifiedHeadline = TENSION_HEADLINE_REWRITES[axis.intentTension](config.headline);
    const detectedTension = extractHeadlineTension(modifiedHeadline);
    const rawIntent = buildVisualIntent({ slideRole: role, topic: config.topic, headline: modifiedHeadline, subject: config.subject });
    const styleLock = applyStyleLock(rawIntent, topicDomain);
    const intent = styleLock.intent;
    const distortion = buildDistortionDirect(axis.distortionType, topicDomain, modifiedHeadline, i);

    const prompt = assembleVariationPrompt(
      config.subject, intent, distortion, axis.compositionFraming,
      template.basePromptFragment, lighting.promptFragment, background.promptFragment,
      template.moodKeywords, styleLock.styleDirectives,
    );
    const negativePrompt = assembleNegativePrompt(intent, styleLock.additionalNegatives);

    allDistortionTexts.push({ text: distortion.sceneInjection, type: distortion.type });
    preBuilt.push({ axis, distortion, intent, modifiedHeadline, detectedTension, prompt, negativePrompt });
  }

  // Second pass: score all distortions (needs full batch for uniqueness)
  for (let i = 0; i < preBuilt.length; i++) {
    const { axis, distortion, intent, modifiedHeadline, detectedTension, prompt, negativePrompt } = preBuilt[i];

    const relevanceInput: RelevanceInput = {
      distortionText: distortion.sceneInjection,
      distortionType: distortion.type,
      headline: config.headline,  // Original headline, not the rewrite
      tensionType: detectedTension.type,
      topic: config.topic,
      framing: axis.compositionFraming.name,
    };

    const score = scoreDistortionRelevance(relevanceInput, allDistortionTexts, i);

    const status = score.accepted ? '✓ ACCEPTED' : '✗ REJECTED';
    const scoreBar = (v: number) => {
      const filled = Math.round(v);
      const empty = 10 - filled;
      return '█'.repeat(filled) + '░'.repeat(empty);
    };

    console.log(`  [${i + 1}] ${axis.intentTension} / ${axis.distortionType} / ${axis.compositionFraming.name}`);
    console.log(`      Visual:   ${scoreBar(score.visualStrength)} ${score.visualStrength}/10`);
    console.log(`      Semantic: ${scoreBar(score.semanticRelevance)} ${score.semanticRelevance}/10`);
    console.log(`      Unique:   ${scoreBar(score.uniqueness)} ${score.uniqueness}/10`);
    console.log(`      Composite: ${score.composite}/10 → ${status}`);
    if (score.rejectionReasons.length > 0) {
      for (const reason of score.rejectionReasons) {
        console.log(`      ⚠ ${reason}`);
      }
    }
    console.log();

    scoredVariations.push({ axis, distortion, intent, modifiedHeadline, detectedTension, prompt, negativePrompt, styleLockDirectives: '', score });
  }

  // Rank and partition
  const ranked = rankVariations(scoredVariations);

  console.log(`${'─'.repeat(70)}`);
  console.log(`  Scoring complete: ${ranked.accepted.length} accepted, ${ranked.rejected.length} rejected (threshold: ${ACCEPTANCE_THRESHOLD})\n`);

  // ─── Phase 2: Generate images (accepted only, unless --skip-rejected) ─

  const toGenerate = config.skipRejected ? scoredVariations : ranked.accepted;

  if (toGenerate.length === 0) {
    console.log('  ⚠ No variations passed relevance scoring. Try a different headline or topic.\n');
    return [];
  }

  console.log(`${'═'.repeat(70)}`);
  console.log(`PHASE 2: Image Generation (${toGenerate.length} variation${toGenerate.length > 1 ? 's' : ''})`);
  console.log(`${'═'.repeat(70)}`);

  const results: VariationResult[] = [];

  for (let i = 0; i < toGenerate.length; i++) {
    const v = toGenerate[i];
    const label = `[${i + 1}/${toGenerate.length}]`;

    console.log(`\n${'━'.repeat(70)}`);
    console.log(`${label} tension=${v.axis.intentTension} | distortion=${v.axis.distortionType} | framing=${v.axis.compositionFraming.name} | score=${v.score.composite}/10`);
    console.log(`  Headline:    "${v.modifiedHeadline}"`);
    console.log(`  Distortion:  [${v.distortion.type}] ${v.distortion.sceneInjection.slice(0, 80)}...`);

    const fileName = `var-${i + 1}-${v.axis.intentTension}-${v.axis.distortionType}-${v.axis.compositionFraming.name}.png`;
    const imagePath = path.join(outputDir, fileName);
    let savedPath: string | null = null;
    let error: string | undefined;

    if (!v.score.accepted && !config.skipRejected) {
      console.log(`  ⊘ Skipped (rejected by relevance filter)`);
    } else {
      try {
        const result = await imageProvider.generateImage(v.prompt, { width: 1080, height: 1350, slideRole: role });
        fs.writeFileSync(imagePath, result.data);
        savedPath = imagePath;
        console.log(`  ✓ Saved: ${fileName} (${(result.data.length / 1024).toFixed(0)}KB)`);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ Failed: ${error}`);
      }
    }

    results.push({
      index: i + 1,
      intentTension: v.axis.intentTension,
      distortionType: v.axis.distortionType,
      compositionFraming: v.axis.compositionFraming.name,
      detectedTension: v.detectedTension.type,
      prompt: v.prompt,
      negativePrompt: v.negativePrompt,
      intentScene: v.intent.scene.slice(0, 200),
      distortionText: v.distortion.sceneInjection.slice(0, 200),
      imagePath: savedPath,
      score: v.score,
      error,
    });
  }

  // ─── Summary ────────────────────────────────────────────────

  console.log(`\n\n${'═'.repeat(70)}`);
  console.log('VARIATION SUMMARY');
  console.log(`${'═'.repeat(70)}\n`);

  const generated = results.filter(r => r.imagePath).length;
  const skipped = results.filter(r => !r.imagePath && !r.error).length;
  const failed = results.filter(r => r.error).length;
  console.log(`  Generated: ${generated}  |  Skipped (rejected): ${skipped}  |  Failed: ${failed}`);
  console.log(`  Relevance threshold: ${ACCEPTANCE_THRESHOLD}/10\n`);

  // Scored results table
  console.log('  ┌─────────────────────┬───────────────────────────┬──────────┬───────┬───────┬───────┬───────┬────────┐');
  console.log('  │ Tension             │ Distortion                │ Framing  │  Vis  │  Sem  │  Unq  │ Total │ Status │');
  console.log('  ├─────────────────────┼───────────────────────────┼──────────┼───────┼───────┼───────┼───────┼────────┤');
  for (const r of results) {
    const vis = r.score.visualStrength.toFixed(1).padStart(4);
    const sem = r.score.semanticRelevance.toFixed(1).padStart(4);
    const unq = r.score.uniqueness.toFixed(1).padStart(4);
    const tot = r.score.composite.toFixed(1).padStart(4);
    const status = r.imagePath ? '  ✓   ' : r.error ? '  ✗   ' : '  ⊘   ';
    console.log(
      `  │ ${r.intentTension.padEnd(19)} │ ${r.distortionType.padEnd(25)} │ ${r.compositionFraming.padEnd(8)} │ ${vis} │ ${sem} │ ${unq} │ ${tot} │${status}│`
    );
  }
  console.log('  └─────────────────────┴───────────────────────────┴──────────┴───────┴───────┴───────┴───────┴────────┘');

  // Rejected details
  if (ranked.rejected.length > 0) {
    console.log(`\n  REJECTED VARIATIONS (${ranked.rejected.length}):`);
    for (const v of ranked.rejected) {
      const idx = scoredVariations.indexOf(v) + 1;
      console.log(`    [${idx}] ${v.axis.intentTension}/${v.axis.distortionType}/${v.axis.compositionFraming.name} — score ${v.score.composite}/10`);
      for (const reason of v.score.rejectionReasons) {
        console.log(`        → ${reason}`);
      }
    }
  }

  // Axis coverage (of accepted only)
  const acceptedResults = results.filter(r => r.imagePath);
  if (acceptedResults.length > 0) {
    const tensionCoverage = new Set(acceptedResults.map(r => r.intentTension));
    const distortionCoverage = new Set(acceptedResults.map(r => r.distortionType));
    const framingCoverage = new Set(acceptedResults.map(r => r.compositionFraming));
    console.log(`\n  Axis coverage (accepted):`);
    console.log(`    Tensions:    ${tensionCoverage.size}/${INTENT_TENSIONS.length} (${Array.from(tensionCoverage).join(', ')})`);
    console.log(`    Distortions: ${distortionCoverage.size}/${DISTORTION_TYPES.length} (${Array.from(distortionCoverage).join(', ')})`);
    console.log(`    Framings:    ${framingCoverage.size}/${COMPOSITION_FRAMINGS.length} (${Array.from(framingCoverage).join(', ')})`);
  }

  // Prompt uniqueness
  const uniquePrompts = new Set(acceptedResults.map(r => r.prompt));
  console.log(`\n  Prompt uniqueness: ${uniquePrompts.size}/${acceptedResults.length} distinct prompts`);

  // Save manifest
  const manifest = results.map(r => ({
    index: r.index,
    intentTension: r.intentTension,
    detectedTension: r.detectedTension,
    distortionType: r.distortionType,
    compositionFraming: r.compositionFraming,
    score: {
      visualStrength: r.score.visualStrength,
      semanticRelevance: r.score.semanticRelevance,
      uniqueness: r.score.uniqueness,
      composite: r.score.composite,
      accepted: r.score.accepted,
      reasoning: r.score.reasoning,
      rejectionReasons: r.score.rejectionReasons,
    },
    prompt: r.prompt,
    negativePrompt: r.negativePrompt,
    intentScene: r.intentScene,
    distortionText: r.distortionText,
    imagePath: r.imagePath ? path.basename(r.imagePath) : null,
    error: r.error ?? null,
  }));

  const manifestPath = path.join(outputDir, `manifest-${Date.now()}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n  Manifest: ${manifestPath}`);
  console.log(`  Output:   ${outputDir}`);
  console.log(`${'═'.repeat(70)}\n`);

  return results;
}

main().catch(err => {
  console.error('Variation generation failed:', err);
  process.exit(1);
});
