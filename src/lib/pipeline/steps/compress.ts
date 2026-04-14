import type { AIProvider } from '@/lib/ai/types';
import type { GeneratedSlideV2 } from '@/lib/validation/schemas';
import { CompressedCarouselPartial, ImplicationStrengthEval, AngleAlignmentEval } from '@/lib/validation/schemas';
import { buildCompressPrompt } from '../prompts/compress-prompt';
import { buildImplicationCompressPrompt } from '../prompts/compress-implication-prompt';
import { buildEvaluateImplicationPrompt } from '../prompts/evaluate-implication-prompt';
import { buildMicroStoryRegenPrompt } from '../prompts/micro-story-regen-prompt';

export interface CompressedSlideDisplay {
  slideNumber: number;
  displayTitle: string;
  displaySupport: string;
  /** Set when micro-story enforcement failed after max retries */
  microStoryWarning?: string;
}

export interface CompressResult {
  compressed: CompressedSlideDisplay[];
}

export interface ImplicationEvalResult {
  specificity: number;
  surprise: number;
  shareability: number;
  score: number;
  issues: string[];
  improvedVersion?: {
    displayTitle: string;
    displaySupport: string;
  };
}

const IMPLICATION_STRENGTH_THRESHOLD = 7;
const MAX_MICRO_STORY_RETRIES = 2;

// ─── Micro-Story Validation ─────────────────────────────────

/** Vague phrases that signal a generic summary instead of a causal story */
const VAGUE_PATTERNS = [
  /led to (chaos|disaster|destruction|problems|issues|trouble)/i,
  /changed everything/i,
  /something (happened|went wrong|occurred)/i,
  /had (major|huge|significant) (consequences|effects|impact)/i,
  /is (known|famous|remembered) for/i,
  /throughout history/i,
  /played (a|an) (important|key|crucial|major) role/i,
];

/** Line 3 patterns that signal abstract interpretation instead of concrete outcome */
const ABSTRACT_CLOSING_PATTERNS = [
  /^(it |this |that |which )?(symbolize|represent|embodi|signifi|reflect|stand[s]? for|serve[s]? as a? ?(symbol|metaphor|reminder|emblem|testament))/i,
  /^(it |this |that |which )?(remain[s]? a ?(symbol|metaphor|reminder|emblem|testament))/i,
  /^(a |the )?(lasting |enduring |powerful |timeless )?(symbol|metaphor|reminder|emblem|testament) (of|for|that)/i,
  /^(it |this )?(illustrat|demonstrat|exemplifi|encapsulat|captur)(es|ed|ing)? (the |a |how |what )/i,
];

/**
 * Story anchor patterns: markers that ground the paragraph in specific, concrete detail.
 */
const STORY_ANCHOR_PATTERNS = [
  /\b\d+\b/,
  /\binto (a |an |the )?[a-z]+/i,
  /\b(for eternity|forever|for \d+ (years?|days?|nights?|centuries)|every (day|night|morning)|until (death|dawn|the end))\b/i,
  /\b(liver|heart|eyes?|head|blood|bones?|skull|tongue|hands?|wings?|skin|flesh|sword|arrow|spear|shield|rock|stone|mountain|ocean|sea|river|throne|crown|fire|flame|serpent|snake|eagle|wolf|lion|spider|web|thread|labyrinth|maze|ship|chariot|mirror|golden|iron|bronze|silver)\b/i,
  /\b(underworld|olympus|tartarus|hades|troy|athens|rome|egypt|temple|cave|island|tower|pit|abyss|cliff|shore)\b/i,
];

/**
 * Check whether text contains at least one story anchor
 * (a specific detail that makes it distinct and memorable).
 */
function hasStoryAnchor(displaySupport: string): boolean {
  for (const pattern of STORY_ANCHOR_PATTERNS) {
    if (pattern.test(displaySupport)) return true;
  }

  // Check for proper nouns: capitalized words that aren't sentence starters
  const sentences = displaySupport.split(/[.!?]\s+/);
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).slice(1);
    for (const word of words) {
      const clean = word.replace(/[^a-zA-Z]/g, '');
      if (clean.length >= 3 && /^[A-Z][a-z]+$/.test(clean)) {
        const COMMON_CAPS = new Set([
          'The', 'His', 'Her', 'Its', 'And', 'But', 'For', 'Not', 'Yet',
        ]);
        if (!COMMON_CAPS.has(clean)) return true;
      }
    }
  }

  return false;
}

/** Connective patterns that signal sentences are causally linked */
const CONNECTIVE_PATTERNS = [
  /\bbecause\b/i,
  /\bwhich\b/i,
  /\bso\b/i,
  /\bletting\b/i,
  /\bmaking\b/i,
  /\bmeaning\b/i,
  /\bsince\b/i,
  /\bthanks to\b/i,
  /\ballowing\b/i,
  /\bwhere\b/i,
  /\bwhen\b/i,
  /\bafter\b/i,
  /\bbefore\b/i,
  /\bas a result\b/i,
  /\benabling\b/i,
  /\bonly for\b/i,
  /\bexplaining why\b/i,
  /\bthat's why\b/i,
  / — (and|so|which|but|meaning|making|letting|yet|only)/i,
  / — [a-z]/i,  // em-dash continuation
  /, (which|so|letting|making|meaning|allowing|enabling|where)/i,
];

/**
 * Validate a FACT displaySupport against flowing-paragraph rules.
 * Returns an array of violation strings (empty = valid).
 */
function validateMicroStory(displaySupport: string): string[] {
  const violations: string[] = [];

  // Total length check
  if (displaySupport.length > 200) {
    violations.push(`paragraph is ${displaySupport.length} chars (max 200)`);
  }

  // Must have at least 2 sentences (rough check: at least one mid-text period)
  const sentenceCount = (displaySupport.match(/[.!?]\s+[A-Z]/g) || []).length + 1;
  if (sentenceCount < 2) {
    violations.push('only 1 sentence — need 2-3 connected sentences for a proper paragraph');
  }

  // Check for newline-separated lines (should be a flowing paragraph, not line breaks)
  const lines = displaySupport.split('\n').filter(l => l.trim().length > 0);
  if (lines.length > 1) {
    violations.push(`contains ${lines.length} separate lines — must be a single flowing paragraph with no line breaks`);
  }

  // Check for vague/generic phrasing
  for (const pattern of VAGUE_PATTERNS) {
    if (pattern.test(displaySupport)) {
      violations.push(`vague phrasing detected: "${displaySupport.match(pattern)?.[0]}"`);
      break;
    }
  }

  // Check for abstract closing
  const lastSentence = displaySupport.split(/[.!?]\s+/).pop() || '';
  for (const pattern of ABSTRACT_CLOSING_PATTERNS) {
    if (pattern.test(lastSentence.trim())) {
      violations.push(`ends with abstract interpretation ("${lastSentence.trim().slice(0, 40)}...") — must end with a concrete detail or outcome`);
      break;
    }
  }

  // Check for connective flow — sentences should be linked, not isolated
  if (sentenceCount >= 2) {
    const hasConnective = CONNECTIVE_PATTERNS.some(p => p.test(displaySupport));
    if (!hasConnective) {
      violations.push('sentences appear disconnected — use causal/explanatory connectives (because, which, so, making, letting, meaning, — and, etc.) to link them into one flowing thought');
    }
  }

  // Check for concrete detail (number, entity, or mechanism)
  const hasNumber = /\b\d[\d,.]*\b/.test(displaySupport);
  const hasStoryAnchorDetail = hasStoryAnchor(displaySupport);
  if (!hasNumber && !hasStoryAnchorDetail) {
    violations.push('no concrete detail — paragraph needs at least one number, named entity, or specific mechanism');
  }

  return violations;
}

/**
 * Score a paragraph for quality (used to pick the best attempt).
 * Higher = better. Range 0–10.
 */
function scoreMicroStory(displaySupport: string): number {
  let score = 0;

  // Single paragraph (no line breaks) = 3pt
  const lines = displaySupport.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 1) score += 3;

  // Length: ≤180 = 2pt, ≤200 = 1pt
  if (displaySupport.length <= 180) score += 2;
  else if (displaySupport.length <= 200) score += 1;

  // No vague phrasing = 1pt
  const hasVague = VAGUE_PATTERNS.some(p => p.test(displaySupport));
  if (!hasVague) score += 1;

  // Multiple sentences = 1pt
  const sentenceCount = (displaySupport.match(/[.!?]\s+[A-Z]/g) || []).length + 1;
  if (sentenceCount >= 2) score += 1;

  // Has connective flow = 3pt
  const hasConnective = CONNECTIVE_PATTERNS.some(p => p.test(displaySupport));
  if (hasConnective) score += 3;

  // No abstract closing = 1pt
  const lastSentence = displaySupport.split(/[.!?]\s+/).pop() || '';
  const hasAbstractClose = ABSTRACT_CLOSING_PATTERNS.some(p => p.test(lastSentence.trim()));
  if (!hasAbstractClose) score += 1;

  // Contains story anchor (specific detail) = 2pt
  if (hasStoryAnchor(displaySupport)) score += 2;

  // Contains number = 1pt
  if (/\b\d[\d,.]*\b/.test(displaySupport)) score += 1;

  return score;
}

/**
 * Evaluate the strength of a compressed IMPLICATION slide.
 * Scores on specificity (0-3), surprise (0-3), and shareability (0-4).
 * If score < 7, returns an improved version.
 */
export async function evaluateImplicationStrength(
  compressed: CompressedSlideDisplay,
  implicationSlide: GeneratedSlideV2,
  previousFacts: GeneratedSlideV2[],
  topic: string,
  ai: AIProvider,
): Promise<ImplicationEvalResult> {
  const prompt = buildEvaluateImplicationPrompt({
    topic,
    compressed,
    implicationSlide,
    previousFacts,
  });

  const { data } = await ai.generateObject(prompt, ImplicationStrengthEval);
  return data;
}

/**
 * Compress a single IMPLICATION slide using fact context,
 * then evaluate its strength. If weak (score < 7), use the
 * evaluator's improved version instead.
 */
export async function compressImplicationSlide(
  slide: GeneratedSlideV2,
  previousFacts: GeneratedSlideV2[],
  topic: string,
  ai: AIProvider,
): Promise<CompressedSlideDisplay> {
  const prompt = buildImplicationCompressPrompt({
    topic,
    implicationSlide: slide,
    previousFacts,
  });

  const { data } = await ai.generateObject(prompt, CompressedCarouselPartial);
  const entry = data.compressed.find(c => c.slideNumber === slide.slideNumber);

  if (!entry) {
    throw new Error(`Implication compression returned no entry for slide ${slide.slideNumber}`);
  }

  // Evaluate strength and upgrade if weak
  const evaluation = await evaluateImplicationStrength(
    entry, slide, previousFacts, topic, ai,
  );

  console.log(
    `[compress] Implication strength: ${evaluation.score}/10` +
    (evaluation.issues.length > 0 ? ` — issues: ${evaluation.issues.join(', ')}` : ''),
  );

  if (evaluation.score < IMPLICATION_STRENGTH_THRESHOLD && evaluation.improvedVersion) {
    console.log(
      `[compress] Upgrading implication: "${entry.displayTitle}" → "${evaluation.improvedVersion.displayTitle}"`,
    );
    return {
      slideNumber: slide.slideNumber,
      displayTitle: evaluation.improvedVersion.displayTitle,
      displaySupport: evaluation.improvedVersion.displaySupport,
    };
  }

  return entry;
}

/**
 * Check whether a FACT slide's micro-story aligns with the carousel angle.
 * Uses an LLM call to evaluate semantic alignment.
 * Returns null if aligned, or a violation string if off-angle.
 */
async function checkAngleAlignment(
  entry: CompressedSlideDisplay,
  sourceSlide: GeneratedSlideV2,
  angleDescription: string,
  topic: string,
  ai: AIProvider,
): Promise<string | null> {
  const prompt = `You are a carousel quality checker. Evaluate whether this FACT slide serves the carousel's chosen angle.

TOPIC: "${topic}"
CAROUSEL ANGLE: "${angleDescription}"

SLIDE:
  displayTitle: "${entry.displayTitle}"
  displaySupport: "${entry.displaySupport}"
  headline: "${sourceSlide.headline}"

QUESTION: Does this slide clearly reinforce the carousel angle "${angleDescription}"?

Rules:
- A slide is ON-ANGLE if the fact directly supports, illustrates, or deepens the angle
- A slide is OFF-ANGLE if it:
  - Could belong to a completely different carousel about the same topic
  - Drifts into a different thematic frame (e.g., angle is "hidden hobbies" but slide is about wars)
  - Is true and interesting but does not serve THIS specific angle
- Be strict: the slide must clearly serve the angle, not just be loosely related to the topic

Return JSON:
{
  "aligned": true/false,
  "reason": "one sentence explaining why it is or isn't aligned"
}`;

  try {
    const { data } = await ai.generateObject(prompt, AngleAlignmentEval);
    if (!data.aligned) {
      return `off-angle: ${data.reason}`;
    }
    return null;
  } catch (err) {
    console.warn(`[compress] Angle alignment check failed: ${err instanceof Error ? err.message : err}`);
    return null; // Don't block on check failure
  }
}

/**
 * COMPRESS step: Transform long-form slide content into short, high-impact
 * display text for Instagram rendering.
 *
 * Routes by slide role:
 * - FACT, OPENER, CTA → standard compression prompt (batched)
 * - IMPLICATION → dedicated compression + strength evaluation
 *
 * The original body is preserved — this is a display-only transformation.
 */
export async function compressSlides(
  params: { topic: string; slides: GeneratedSlideV2[]; angleDescription?: string; layout?: 'DETAILED' | 'BOLD' },
  ai: AIProvider,
): Promise<CompressResult> {
  const { topic, slides, angleDescription, layout } = params;

  // Separate slides by role
  const implicationSlides = slides.filter(s => s.role === 'IMPLICATION');
  const otherSlides = slides.filter(s => s.role !== 'IMPLICATION');
  const factSlides = slides.filter(s => s.role === 'FACT');

  // Compress non-implication slides with the standard prompt (partial schema — IMPLICATION merged after)
  const standardPrompt = buildCompressPrompt({ topic, slides: otherSlides, angleDescription, layout });
  const [standardResult, ...implicationResults] = await Promise.all([
    ai.generateObject(standardPrompt, CompressedCarouselPartial),
    ...implicationSlides.map(slide =>
      compressImplicationSlide(slide, factSlides, topic, ai),
    ),
  ]);

  // Merge results back together, sorted by slideNumber
  const allCompressed: CompressedSlideDisplay[] = [
    ...standardResult.data.compressed,
    ...implicationResults,
  ].sort((a, b) => a.slideNumber - b.slideNumber);

  // ── Hardcode CTA display text (always the same, regardless of LLM output) ──
  const ctaSlideNumbers = new Set(slides.filter(s => s.role === 'CTA').map(s => s.slideNumber));
  for (const entry of allCompressed) {
    if (ctaSlideNumbers.has(entry.slideNumber)) {
      entry.displayTitle = 'We post only interesting facts!';
      entry.displaySupport = 'Follow us to get fresh facts everyday';
    }
  }

  // ── Micro-story enforcement for FACT slides ─────────────────
  // Skip for BOLD layout — body text is not rendered, so micro-story validation is irrelevant.
  // Validate structure. If invalid → regenerate text only (up to MAX_MICRO_STORY_RETRIES).
  // If still invalid after retries → keep best attempt + mark with warning.
  if (layout === 'BOLD') {
    return { compressed: allCompressed };
  }
  const factSlideNumbers = new Set(factSlides.map(s => s.slideNumber));
  for (let i = 0; i < allCompressed.length; i++) {
    const entry = allCompressed[i];
    if (!factSlideNumbers.has(entry.slideNumber)) continue;

    const sourceSlide = factSlides.find(s => s.slideNumber === entry.slideNumber);
    if (!sourceSlide) continue;

    let current = entry;
    let bestAttempt = entry;
    let bestScore = scoreMicroStory(entry.displaySupport);
    let attempt = 0;

    while (attempt < MAX_MICRO_STORY_RETRIES) {
      // Collect all violations: structural + angle alignment
      const violations = validateMicroStory(current.displaySupport);

      // If structural checks pass and angle is provided, check angle alignment
      if (violations.length === 0 && angleDescription) {
        const angleViolation = await checkAngleAlignment(
          current, sourceSlide, angleDescription, topic, ai,
        );
        if (angleViolation) {
          violations.push(angleViolation);
        }
      }

      if (violations.length === 0) {
        console.log(`[compress] ✓ Slide ${current.slideNumber} micro-story valid (attempt ${attempt})`);
        break;
      }

      attempt++;
      console.warn(`[compress] MICRO-STORY VIOLATION slide ${current.slideNumber} (attempt ${attempt}/${MAX_MICRO_STORY_RETRIES}): ${violations.join('; ')}`);

      try {
        const regenPrompt = buildMicroStoryRegenPrompt({
          topic,
          slide: sourceSlide,
          currentTitle: current.displayTitle,
          currentSupport: current.displaySupport,
          violations,
          angleDescription,
        });
        const { data } = await ai.generateObject(regenPrompt, CompressedCarouselPartial);
        const regen = data.compressed.find(c => c.slideNumber === current.slideNumber);
        if (regen) {
          current = regen;
          const score = scoreMicroStory(regen.displaySupport);
          if (score > bestScore) {
            bestScore = score;
            bestAttempt = regen;
          }
        }
      } catch (err) {
        console.warn(`[compress] Micro-story regen failed for slide ${current.slideNumber}: ${err instanceof Error ? err.message : err}`);
        break;
      }
    }

    // Final check after retries (structural only — angle is best-effort)
    const finalViolations = validateMicroStory(current.displaySupport);
    if (finalViolations.length === 0) {
      allCompressed[i] = current;
    } else {
      // Keep the best attempt but mark it
      const warning = `micro-story enforcement failed after ${attempt} retries: ${finalViolations.join('; ')}`;
      console.error(`[compress] MICRO-STORY HARD FAIL slide ${bestAttempt.slideNumber}: ${warning}`);
      allCompressed[i] = { ...bestAttempt, microStoryWarning: warning };
    }
  }

  return { compressed: allCompressed };
}
