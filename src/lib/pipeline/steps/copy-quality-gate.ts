/**
 * Copy Quality Gate — Post-Pipeline Slide Quality Enforcement
 *
 * Runs AFTER the pipeline compose/validate/patch cycle and AFTER
 * enforce6SlideStructure, but BEFORE image rendering.
 *
 * Catches weak copy that slipped through the pipeline:
 *   - Generic/vague phrasing
 *   - CTA not closing the hook
 *   - FACT structural repetition (same opening pattern, same factType)
 *   - Near-duplicate ideas across slides
 *
 * Weak slides are automatically rewritten via a targeted LLM call.
 */

import { jaccardSimilarity, extractPattern } from '@/lib/utils/similarity';
import type { AIProvider } from '@/lib/ai/types';
import type { GeneratedSlideV2, CompressedSlideDisplay } from '@/lib/validation/schemas';
import { compressSlides } from './compress';

// ─── Types ──────────────────────────────────────────────────

export type QualityIssue =
  | 'WEAK_CTA_NO_HOOK_CONNECTION'
  | 'GENERIC_CTA_LANGUAGE'
  | 'CTA_MISSING_ACTION_VERB'
  | 'CTA_HAS_NEW_FACTS'
  | 'VAGUE_CLAIM'
  | 'DUPLICATE_IDEA'
  | 'REPEATED_STRUCTURE'
  | 'REPEATED_FACT_TYPE'
  | 'FILLER_HEADLINE'
  | 'ABSTRACT_FLUFF';

export interface SlideIssue {
  slideIndex: number;
  issue: QualityIssue;
  detail: string;
}

export interface QualityGateResult {
  /** Slides after quality rewrites (same structure, improved copy) */
  slides: GeneratedSlideV2[];
  /** Updated compressed display text */
  compressedSlides: CompressedSlideDisplay[];
  /** Issues found (including ones that were auto-fixed) */
  issues: SlideIssue[];
  /** How many slides were rewritten */
  rewriteCount: number;
}

// ─── Weak Pattern Detection ─────────────────────────────────

/** Generic CTA phrases that should be rewritten */
const GENERIC_CTA_PATTERNS = [
  /discover\s+more/i,
  /you['']?ve\s+only\s+scratched\s+the\s+surface/i,
  /stay\s+tuned/i,
  /wait\s+till\s+you\s+see/i,
  /you\s+won['']?t\s+believe/i,
  /mind[\s-]?blown/i,
  /this\s+is\s+just\s+the\s+beginning/i,
  /there['']?s\s+so\s+much\s+more/i,
  /the\s+best\s+is\s+yet\s+to\s+come/i,
  /you['']?re\s+not\s+ready/i,
  /your\s+(brain|mind)\s+(isn['']?t|won['']?t\s+be)\s+ready/i,
  /buckle\s+up/i,
  /we['']?re\s+just\s+getting\s+started/i,
  /if\s+you\s+thought\s+(this|that)\s+was\s+(wild|crazy|insane)/i,
  /want\s+more/i,
  /keep\s+reading/i,
  /don['']?t\s+miss/i,
];

/** CTA action verbs — at least one must be present */
const CTA_ACTION_VERB_PATTERN = /\b(save|follow|share|comment|subscribe|learn|discover|explore|swipe|tap|check|grab|join|try|read|watch|listen|start|get|see|find|click|visit|bookmark|sign\s+up|tag)\b/i;

function checkCTAActionVerb(slide: GeneratedSlideV2): SlideIssue | null {
  if (slide.role !== 'CTA') return null;

  const text = `${slide.headline} ${slide.body}`;
  if (!CTA_ACTION_VERB_PATTERN.test(text)) {
    return {
      slideIndex: slide.slideNumber,
      issue: 'CTA_MISSING_ACTION_VERB',
      detail: 'CTA must include an action verb (save, follow, comment, learn, etc.)',
    };
  }
  return null;
}

function checkCTANewFacts(slide: GeneratedSlideV2): SlideIssue | null {
  if (slide.role !== 'CTA') return null;

  const body = slide.body;
  // Detect numbers with context, dates, or new comparisons in CTA body
  const hasNumber = /\b\d[\d,.]*[%xMBKT]?\b|\$\d|\b\d+(st|nd|rd|th)\b/i.test(body);
  const hasDate = /\b(1[0-9]{3}|20[0-9]{2})\b/.test(body);
  const hasComparison = /\b(than|compared to|versus|vs\.?)\b/i.test(body) && body.length > 50;

  if ((hasNumber && body.length > 40) || hasDate || hasComparison) {
    return {
      slideIndex: slide.slideNumber,
      issue: 'CTA_HAS_NEW_FACTS',
      detail: 'CTA introduces new factual content (numbers, dates, comparisons) — it should only drive action',
    };
  }
  return null;
}

/** Vague claim patterns — hedging, non-committal language */
const VAGUE_CLAIM_PATTERNS = [
  /^(it['']?s\s+)?(interesting|surprising|fascinating|remarkable|incredible)\s+(that|how|to)/i,
  /many\s+people\s+(think|believe|assume|don['']?t\s+(know|realize))/i,
  /most\s+people\s+(don['']?t|have\s+no)\s+(know|idea|realize|understand)/i,
  /what\s+(most|many)\s+people\s+(miss|overlook|forget|ignore)/i,
  /few\s+people\s+(know|realize|understand)/i,
  /the\s+(real|actual|hidden)\s+(truth|secret|reason)/i,
  /everything\s+(you\s+)?(know|think|thought|believe)\s+(about|is)/i,
  /here['']?s\s+(the\s+thing|what\s+(you|nobody))/i,
  /let['']?s\s+(talk\s+about|dive\s+into|break\s+(this|it)\s+down)/i,
  /not\s+what\s+(you|it)\s+(think|seem)/i,
  /think\s+again/i,
  /you['']?d\s+be\s+surprised/i,
];

/** Abstract filler words that inflate body text without adding information */
const ABSTRACT_FILLER_WORDS = new Set([
  'revolutionary', 'game-changing', 'groundbreaking', 'mind-blowing',
  'incredible', 'remarkable', 'fascinating', 'astonishing',
  'profound', 'powerful', 'transformative', 'paradigm',
  'unprecedented', 'extraordinary', 'unbelievable', 'amazing',
  'energy', 'duality', 'balance', 'harmony', 'essence',
  'force', 'spirit', 'aura', 'vibration', 'synergy', 'cosmic',
]);

/** Filler headline starters — label-like, not claim-like */
const FILLER_HEADLINE_PATTERNS = [
  /^the\s+(surprising|shocking|hidden|real|little[\s-]known)\s+(truth|fact|reason|secret|story)/i,
  /^what\s+(nobody|no\s+one|few)\s+(tells|told|knows|talks)/i,
  /^the\s+untold\s+(story|truth|secret)/i,
  /^why\s+(this|it)\s+(matters|is\s+important)/i,
  /^here['']?s\s+why/i,
  /^the\s+real\s+story\s+(behind|of)/i,
  /^did\s+you\s+know/i,
];

// ─── Quality Checks ─────────────────────────────────────────

function checkGenericCTA(slide: GeneratedSlideV2): SlideIssue | null {
  const text = `${slide.headline} ${slide.body}`.toLowerCase();
  for (const pattern of GENERIC_CTA_PATTERNS) {
    if (pattern.test(text)) {
      return {
        slideIndex: slide.slideNumber,
        issue: 'GENERIC_CTA_LANGUAGE',
        detail: `CTA uses generic template language: "${text.match(pattern)?.[0]}"`,
      };
    }
  }
  return null;
}

function checkCTAHookConnection(
  ctaSlide: GeneratedSlideV2,
  hookHeadline: string,
  topic: string,
): SlideIssue | null {
  const ctaText = `${ctaSlide.headline} ${ctaSlide.body}`.toLowerCase();
  const hookLower = hookHeadline.toLowerCase();

  // Extract content words from hook (skip stop words)
  const hookWords = hookLower
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3);

  // Extract content words from topic
  const topicWords = topic.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3);

  // CTA must reference either a hook keyword or a topic keyword
  const hasHookRef = hookWords.some(w => ctaText.includes(w));
  const hasTopicRef = topicWords.some(w => ctaText.includes(w));

  if (!hasHookRef && !hasTopicRef) {
    return {
      slideIndex: ctaSlide.slideNumber,
      issue: 'WEAK_CTA_NO_HOOK_CONNECTION',
      detail: `CTA doesn't reference hook or topic. Hook: "${hookHeadline.slice(0, 60)}"`,
    };
  }

  return null;
}

function checkVagueClaims(slide: GeneratedSlideV2): SlideIssue | null {
  const headline = slide.headline;
  for (const pattern of VAGUE_CLAIM_PATTERNS) {
    if (pattern.test(headline)) {
      return {
        slideIndex: slide.slideNumber,
        issue: 'VAGUE_CLAIM',
        detail: `Headline uses vague framing: "${headline.match(pattern)?.[0]}"`,
      };
    }
  }

  // Check body for high abstract word density
  const bodyWords = slide.body.toLowerCase().split(/\s+/);
  const abstractCount = bodyWords.filter(w => ABSTRACT_FILLER_WORDS.has(w)).length;
  const ratio = bodyWords.length > 0 ? abstractCount / bodyWords.length : 0;

  if (ratio > 0.08 && abstractCount >= 3) {
    return {
      slideIndex: slide.slideNumber,
      issue: 'ABSTRACT_FLUFF',
      detail: `Body has ${abstractCount} abstract filler words (${(ratio * 100).toFixed(0)}% density)`,
    };
  }

  return null;
}

function checkFillerHeadline(slide: GeneratedSlideV2): SlideIssue | null {
  for (const pattern of FILLER_HEADLINE_PATTERNS) {
    if (pattern.test(slide.headline)) {
      return {
        slideIndex: slide.slideNumber,
        issue: 'FILLER_HEADLINE',
        detail: `Headline is a filler label, not a specific claim: "${slide.headline}"`,
      };
    }
  }
  return null;
}

function checkDuplicateIdeas(facts: GeneratedSlideV2[]): SlideIssue[] {
  const issues: SlideIssue[] = [];

  for (let i = 0; i < facts.length; i++) {
    for (let j = i + 1; j < facts.length; j++) {
      const a = facts[i];
      const b = facts[j];

      // Headline similarity
      const headlineSim = jaccardSimilarity(a.headline, b.headline);
      if (headlineSim > 0.35) {
        issues.push({
          slideIndex: b.slideNumber,
          issue: 'DUPLICATE_IDEA',
          detail: `Headline too similar to slide ${a.slideNumber + 1} (${(headlineSim * 100).toFixed(0)}% overlap): "${a.headline.slice(0, 40)}..." vs "${b.headline.slice(0, 40)}..."`,
        });
        continue; // Don't double-flag
      }

      // Body similarity (tighter than pipeline's 40% — we catch at 30%)
      const bodySim = jaccardSimilarity(a.body, b.body);
      if (bodySim > 0.30) {
        issues.push({
          slideIndex: b.slideNumber,
          issue: 'DUPLICATE_IDEA',
          detail: `Body too similar to slide ${a.slideNumber + 1} (${(bodySim * 100).toFixed(0)}% overlap)`,
        });
      }
    }
  }

  return issues;
}

function checkRepeatedStructure(facts: GeneratedSlideV2[]): SlideIssue[] {
  const issues: SlideIssue[] = [];

  // Check headline opening patterns (first 3 content words)
  const patterns = facts.map(f => extractPattern(f.headline, 3));
  const patternCounts = new Map<string, number[]>();

  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i];
    if (!p) continue;
    const existing = patternCounts.get(p) ?? [];
    existing.push(i);
    patternCounts.set(p, existing);
  }

  for (const [pattern, indices] of patternCounts) {
    if (indices.length >= 2) {
      // Flag all but the first occurrence
      for (let k = 1; k < indices.length; k++) {
        issues.push({
          slideIndex: facts[indices[k]].slideNumber,
          issue: 'REPEATED_STRUCTURE',
          detail: `Headline opens like slide ${facts[indices[0]].slideNumber + 1}: "${pattern}..."`,
        });
      }
    }
  }

  return issues;
}

function checkRepeatedFactType(facts: GeneratedSlideV2[]): SlideIssue[] {
  const issues: SlideIssue[] = [];

  const typeCounts = new Map<string, number[]>();
  for (let i = 0; i < facts.length; i++) {
    const ft = facts[i].factType || 'unknown';
    const existing = typeCounts.get(ft) ?? [];
    existing.push(i);
    typeCounts.set(ft, existing);
  }

  // If 2+ FACTs share the same factType, flag excess (enforce diversity across all 4 FACT slides)
  for (const [factType, indices] of typeCounts) {
    if (indices.length >= 2) {
      // Flag from the 2nd occurrence
      for (let k = 1; k < indices.length; k++) {
        issues.push({
          slideIndex: facts[indices[k]].slideNumber,
          issue: 'REPEATED_FACT_TYPE',
          detail: `2+ slides use factType "${factType}" — each FACT slide must use a unique factType`,
        });
      }
    }
  }

  return issues;
}

// ─── Rewrite Prompt ─────────────────────────────────────────

function buildRewritePrompt(
  slide: GeneratedSlideV2,
  issues: SlideIssue[],
  allSlides: GeneratedSlideV2[],
  topic: string,
  hookHeadline: string,
): string {
  const issueList = issues.map(i => `- ${i.issue}: ${i.detail}`).join('\n');

  const otherSlides = allSlides
    .filter(s => s.slideNumber !== slide.slideNumber)
    .map(s => `  Slide ${s.slideNumber + 1} (${s.role}): "${s.headline}"`)
    .join('\n');

  // Determine what factTypes are already used
  const usedFactTypes: string[] = allSlides
    .filter(s => s.role === 'FACT' && s.slideNumber !== slide.slideNumber)
    .map(s => s.factType)
    .filter(Boolean) as string[];

  const availableFactTypes = ['statistic', 'comparison', 'mechanism', 'historical', 'example', 'definition']
    .filter(ft => !usedFactTypes.includes(ft));

  return `You are rewriting a single carousel slide because it failed quality review.

TOPIC: "${topic}"
HOOK: "${hookHeadline}"
SLIDE TO REWRITE: Slide ${slide.slideNumber + 1} (${slide.role})

CURRENT (REJECTED):
  headline: "${slide.headline}"
  body: "${slide.body}"
  factType: ${slide.factType || 'null'}

QUALITY ISSUES:
${issueList}

OTHER SLIDES IN CAROUSEL (do NOT duplicate these):
${otherSlides}

${slide.role === 'FACT' ? `AVAILABLE factTypes (not yet used): ${availableFactTypes.join(', ') || 'all used — pick the least represented'}` : ''}
${slide.role === 'CTA' ? `HOOK TO CLOSE: "${hookHeadline}"\nThe CTA MUST directly reference or resolve the curiosity created by the hook. Use a word, phrase, or concept from the hook.` : ''}

REWRITE RULES:
- Fix ALL listed quality issues
- ${slide.role === 'FACT' ? 'headline: 20–100 chars, specific factual claim (not a label or question)' : ''}
- ${slide.role === 'FACT' ? 'body: 200–400 chars, must include at least ONE of: number, named entity, comparison, date' : ''}
- ${slide.role === 'CTA' ? 'headline: 20–80 chars, punchy, drives follow/save' : ''}
- ${slide.role === 'CTA' ? 'body: 20–100 chars, reinforces action, references THIS topic' : ''}
- ${slide.role === 'OPENER' ? 'headline: 20–80 chars, creates explicit knowledge gap' : ''}
- ${slide.role === 'OPENER' ? 'body: 0–60 chars (optional), only if it adds tension' : ''}
- Do NOT use any of these words: interesting, surprising, fascinating, remarkable, incredible, revolutionary, game-changing, groundbreaking, mind-blowing, discover more, scratched the surface
- Do NOT start headline the same way as any other slide
- Be SPECIFIC: use numbers, names, comparisons, mechanisms
- The slide must pass the "would someone screenshot this?" test

Return JSON:
{
  "headline": "...",
  "body": "...",
  "supportingDetail": "..." or null,
  "factType": "${slide.role === 'FACT' ? `one of: ${availableFactTypes[0] || 'mechanism'}` : slide.factType || 'null'}",
  "containsNumber": true/false,
  "concretenessScore": 1-5,
  "noveltyScore": 1-5,
  "topicEntity": "specific entity name" or null
}`;
}

// ─── Main Quality Gate ──────────────────────────────────────

export async function runCopyQualityGate(
  slides: GeneratedSlideV2[],
  compressedSlides: CompressedSlideDisplay[],
  topic: string,
  hookHeadline: string,
  ai: AIProvider,
  layout?: 'DETAILED' | 'BOLD',
): Promise<QualityGateResult> {
  const allIssues: SlideIssue[] = [];

  // ── 1. Per-slide checks ──────────────────────────────────

  const facts = slides.filter(s => s.role === 'FACT');
  const cta = slides.find(s => s.role === 'CTA');
  const opener = slides.find(s => s.role === 'OPENER');

  // Check each slide individually
  for (const slide of slides) {
    if (slide.role === 'FACT') {
      const vague = checkVagueClaims(slide);
      if (vague) allIssues.push(vague);

      const filler = checkFillerHeadline(slide);
      if (filler) allIssues.push(filler);
    }

    if (slide.role === 'OPENER') {
      const vague = checkVagueClaims(slide);
      if (vague) allIssues.push(vague);
    }

    if (slide.role === 'CTA') {
      const generic = checkGenericCTA(slide);
      if (generic) allIssues.push(generic);

      const hookConn = checkCTAHookConnection(slide, hookHeadline, topic);
      if (hookConn) allIssues.push(hookConn);

      const actionVerb = checkCTAActionVerb(slide);
      if (actionVerb) allIssues.push(actionVerb);

      const newFacts = checkCTANewFacts(slide);
      if (newFacts) allIssues.push(newFacts);
    }
  }

  // ── 2. Cross-slide checks (FACT diversity) ───────────────

  if (facts.length >= 2) {
    allIssues.push(...checkDuplicateIdeas(facts));
    allIssues.push(...checkRepeatedStructure(facts));
    allIssues.push(...checkRepeatedFactType(facts));
  }

  // ── 3. Log findings ──────────────────────────────────────

  if (allIssues.length === 0) {
    console.log(`[CopyQualityGate] All ${slides.length} slides passed quality checks`);
    return { slides, compressedSlides, issues: [], rewriteCount: 0 };
  }

  console.warn(`[CopyQualityGate] Found ${allIssues.length} quality issues:`);
  for (const issue of allIssues) {
    console.warn(`  Slide ${issue.slideIndex + 1}: ${issue.issue} — ${issue.detail}`);
  }

  // ── 4. Group issues by slide and rewrite ─────────────────

  const issuesBySlide = new Map<number, SlideIssue[]>();
  for (const issue of allIssues) {
    const existing = issuesBySlide.get(issue.slideIndex) ?? [];
    existing.push(issue);
    issuesBySlide.set(issue.slideIndex, existing);
  }

  let rewriteCount = 0;
  const updatedSlides = [...slides];
  let updatedCompressed = [...compressedSlides];

  // Rewrite up to 3 slides max per gate run (prevent infinite loops)
  const slidesToRewrite = [...issuesBySlide.entries()].slice(0, 3);

  for (const [slideIndex, slideIssues] of slidesToRewrite) {
    const originalSlide = updatedSlides.find(s => s.slideNumber === slideIndex);
    if (!originalSlide) continue;

    const prompt = buildRewritePrompt(
      originalSlide,
      slideIssues,
      updatedSlides,
      topic,
      hookHeadline,
    );

    try {
      const { RewrittenSlide: RewrittenSlideSchema } = await import('@/lib/validation/schemas');

      const { data: rewritten } = await ai.generateObject(prompt, RewrittenSlideSchema);

      // Replace in array — merge rewritten fields back into the existing slide
      const idx = updatedSlides.findIndex(s => s.slideNumber === slideIndex);
      if (idx !== -1) {
        updatedSlides[idx] = {
          ...updatedSlides[idx],
          headline: rewritten.headline,
          body: rewritten.body,
          supportingDetail: rewritten.supportingDetail,
          factType: rewritten.factType,
          containsNumber: rewritten.containsNumber,
          concretenessScore: rewritten.concretenessScore,
          noveltyScore: rewritten.noveltyScore,
          topicEntity: rewritten.topicEntity,
        };
        rewriteCount++;
        console.log(`[CopyQualityGate] Rewrote slide ${slideIndex + 1} (${originalSlide.role}): "${originalSlide.headline.slice(0, 40)}..." → "${rewritten.headline.slice(0, 40)}..."`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[CopyQualityGate] REWRITE FAILED for slide ${slideIndex + 1}: ${msg}`);
      console.error(`[CopyQualityGate] Original kept — slide ${slideIndex + 1} still has quality issues: ${slideIssues.map(i => i.issue).join(', ')}`);
    }
  }

  // ── 5. Re-compress rewritten slides ──────────────────────

  if (rewriteCount > 0) {
    try {
      const compressResult = await compressSlides(
        { topic, slides: updatedSlides, layout },
        ai,
      );
      updatedCompressed = compressResult.compressed;
    } catch (err) {
      console.warn(`[CopyQualityGate] Re-compress failed — using fallback truncation`);
      updatedCompressed = updatedSlides.map(s => ({
        slideNumber: s.slideNumber,
        displayTitle: s.headline,
        displaySupport: s.body,
      }));
    }
  }

  console.log(`[CopyQualityGate] Gate complete: ${allIssues.length} issues found, ${rewriteCount} slides rewritten`);

  return {
    slides: updatedSlides,
    compressedSlides: updatedCompressed,
    issues: allIssues,
    rewriteCount,
  };
}
