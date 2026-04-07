// ─── Carousel Validator (V2) ─────────────────────────────────
// Deterministic validation for the v2 carousel schema.
// Replaces: slide-quality-validator.ts, slide-continuity.ts

import { jaccardSimilarity, findRepeatedPhrases } from '@/lib/utils/similarity';

// ─── Types ──────────────────────────────────────────────────────

interface SlideInput {
  slideNumber: number;
  role: 'OPENER' | 'FACT' | 'IMPLICATION' | 'CTA';
  headline: string;
  body: string;
  supportingDetail: string | null;
  factType: string | null;
  containsNumber: boolean;
  concretenessScore: number;
  noveltyScore: number;
  topicEntity: string | null;
}

interface CarouselInput {
  title: string;
  topicConfidence: number;
  slides: SlideInput[];
}

type HardFailType =
  | 'BANNED_PHRASE'
  | 'HEADLINE_TOO_SHORT'
  | 'HEADLINE_TOO_LONG'
  | 'BODY_TOO_SHORT'
  | 'BODY_TOO_LONG'
  | 'NO_VALUE_SIGNAL'
  | 'HEADLINE_IS_LABEL'
  | 'DUPLICATE_SLIDE'
  | 'IMPLICATION_IS_CTA'
  | 'IMPLICATION_IS_FORMULA'
  | 'FACT_MISSING_FACT_TYPE'
  | 'TOPIC_DRIFT'
  | 'CTA_GENERIC_PHRASE'
  | 'CTA_MISSING_ACTION_VERB'
  | 'CTA_INTRODUCES_FACTS';

type SoftFlagType =
  | 'HIGH_ABSTRACT_RATIO'
  | 'NO_NUMBER'
  | 'LOW_CONCRETENESS_SELF_REPORT'
  | 'LOW_NOVELTY_SELF_REPORT'
  | 'NUMBER_SELF_REPORT_MISMATCH'
  | 'ENTITY_OVERLAP'
  | 'ENTITY_DRIFT'
  | 'REPEATED_PHRASE'
  | 'IMPLICATION_WEAK_SYNTHESIS'
  | 'IMPLICATION_IS_LISTING'
  | 'TRAILING_FILLER'
  | 'LOW_TOPIC_CONFIDENCE';

interface HardFail {
  slideIndex: number;
  type: HardFailType;
  description: string;
}

interface SoftFlag {
  slideIndex: number; // -1 for carousel-level
  type: SoftFlagType;
  description: string;
  penalty: number; // points deducted from 100
}

interface SlideResult {
  slideIndex: number;
  role: string;
  passed: boolean;
  hardFails: HardFail[];
  softFlags: SoftFlag[];
}

interface CarouselValidationReport {
  passed: boolean;           // true if zero hard fails
  score: number;             // 0-100, after soft penalties
  slideResults: SlideResult[];
  hardFails: HardFail[];     // all hard fails, flattened
  softFlags: SoftFlag[];     // all soft flags, flattened
  slidesToRegenerate: number[]; // indices of slides with hard fails
}


// ─── Banned Phrases ─────────────────────────────────────────────

const BANNED_PHRASES: RegExp[] = [
  // Vague openers
  /everything is changing/i,
  /nobody is ready/i,
  /the game has changed/i,
  /this changes everything/i,
  /you('re| are) not ready/i,
  /things will never be the same/i,

  // Generic authority claims
  /most people don'?t know/i,
  /no one is talking about/i,
  /what they don'?t tell you/i,
  /here'?s the truth/i,
  /the secret is/i,
  /you need to understand/i,
  /it'?s time to wake up/i,
  /the world is not what it seems/i,
  /let that sink in/i,
  /read that again/i,

  // Filler transitions
  /but that'?s not the whole story/i,
  /and it gets even more interesting/i,
  /let'?s break this down/i,
  /here'?s where it gets interesting/i,
  /but wait,? there'?s more/i,
  /the real story/i,
  /more complex than you think/i,

  // Motivational fluff
  /game changer/i,
  /level up/i,
  /mindset shift/i,
  /wake up call/i,
  /think about that/i,
  /let me explain/i,
  /here'?s why this matters/i,

  // Abstract platitudes
  /hidden truth/i,
  /deeper meaning/i,
  /the power of/i,
  /unlock your/i,
  /transform your/i,
  /the energy of/i,
  /the duality of/i,
  /the balance of/i,
  /the balance between/i,
  /perfect balance/i,
  /cosmic energy/i,
  /inner energy/i,
  /natural harmony/i,
  /embodies the/i,
  /represents the essence/i,
  /more than (just )?(light|darkness|a symbol|a myth|a legend)/i,
  /guide[sd]?\s+(the\s+)?(realms?|souls?|spirits?|dead)/i,
  /from\s+(the\s+)?underworld\s+to\s+(the\s+)?(life|light|surface)/i,
  /trusted\s+(power|force|authority|wisdom)/i,
  /commands?\s+(the\s+)?(spirits?|elements?|forces?|winds?|seas?|dead)/i,
  /bridge\s+between\s+(life|death|worlds?|realms?)/i,
  /embod(y|ies|ied)\s+(the\s+)?(spirit|essence|power|force|duality)/i,
  /symbol\s+of\s+(power|strength|wisdom|justice|truth|life|death)/i,
  /wield(s|ed)?\s+(the\s+)?(power|force|authority|might)\s+of/i,

  // Body filler / meta-commentary (sentences that describe the fact instead of adding to it)
  /this (strange |surprising |historical |important |remarkable |incredible )?(fact|event|occurrence|achievement|detail|discovery|milestone) (shows|highlights|underscores|illustrates|demonstrates|showcases|reveals|emphasizes)/i,
  /this (is )?a (testament|reminder|reflection|symbol|example) (of|to)/i,
  /solidifying (its|their|his|her) (place|position|status)/i,
  /enriching the (reader'?s|viewer'?s|audience'?s)/i,
];


// ─── Abstract Words ─────────────────────────────────────────────

const ABSTRACT_WORDS = new Set([
  'truth', 'meaning', 'power', 'secret', 'hidden', 'real',
  'deeper', 'journey', 'mystery', 'lesson', 'change', 'believe',
  'discover', 'understand', 'realize', 'imagine', 'transform',
  'evolve', 'reveal', 'inspire', 'empower', 'unlock', 'embrace',
  'paradigm', 'shift', 'mindset', 'breakthrough', 'revolutionary',
  'game', 'changer', 'ultimate', 'powerful', 'incredible',
  'energy', 'duality', 'balance', 'harmony', 'essence', 'force',
  'spirit', 'aura', 'vibration', 'synergy', 'dynamic', 'cosmic',
]);


// ─── CTA Keywords ───────────────────────────────────────────────

const CTA_PATTERNS: RegExp[] = [
  /\bfollow\b/i,
  /\bsave this\b/i,
  /\bshare this\b/i,
  /\bsubscribe\b/i,
  /\bcomment below\b/i,
  /\btag someone\b/i,
  /\bturn on notifications\b/i,
  /\blink in bio\b/i,
  /\bfor more tips\b/i,
  /\bfollow for\b/i,
  /\bdrop a\b/i,
  /\blet me know in the comments\b/i,
];


// ─── Label Headlines ────────────────────────────────────────────

const LABEL_PATTERNS: RegExp[] = [
  /^the history$/i,
  /^another example$/i,
  /^here'?s the thing$/i,
  /^fun fact/i,
  /^did you know/i,
  /^the (first|second|third|fourth|fifth|sixth|next) (one|thing|fact|point)/i,
  /^(and |but )?also$/i,
  /^one more thing$/i,
  /^bonus/i,
  /^the takeaway$/i,
  /^in conclusion$/i,
  /^to summarize$/i,
  /^the bottom line$/i,
];

function isLabelHeadline(headline: string): boolean {
  const trimmed = headline.trim();
  if (LABEL_PATTERNS.some(p => p.test(trimmed))) return true;

  // Heuristic: headline has no verb and is under 4 words → likely a label
  const hasVerb = /\b(is|are|was|were|has|had|have|did|does|do|made|built|created|killed|caused|changed|became|took|gave|lost|won|found|used|produced|held|costs?|averag|last|contain|weigh|measur|reach|exceed|outperform|surpass|beat|ban|stopp|prevent|allow|requir|prov|show|reveal|discover|invent)\w*\b/i.test(trimmed);
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount <= 3 && !hasVerb) return true;

  return false;
}


// ─── Detection Utilities ────────────────────────────────────────

function hasNumber(text: string): boolean {
  // Meaningful numbers, not stray digits in words
  // Matches: 1.8M, 50,000, 48.5, 1756, 3x, 100%, $5, 15th, 1st, 2nd, 3rd
  return /\b\d[\d,.]*[%xMBKT]?\b|\$\d|\b\d+(st|nd|rd|th)\b/i.test(text);
}

// Common sentence-starting words that are capitalized but not proper nouns
const COMMON_STARTERS = new Set([
  'the', 'this', 'that', 'these', 'those', 'there', 'they', 'their',
  'when', 'where', 'what', 'which', 'who', 'whom', 'whose', 'why', 'how',
  'each', 'every', 'some', 'many', 'most', 'more', 'less', 'few',
  'all', 'both', 'such', 'only', 'just', 'even', 'also', 'still',
  'and', 'but', 'yet', 'nor', 'for', 'not',
  'its', 'our', 'your', 'his', 'her',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'over', 'under', 'after', 'before', 'between', 'during', 'about',
]);

function hasProperNoun(text: string): boolean {
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/[^a-zA-Z]/g, '');
    if (w.length <= 1) continue;
    if (!/^[A-Z][a-z]/.test(w)) continue;
    // For position 0, exclude common starters
    if (i === 0 && COMMON_STARTERS.has(w.toLowerCase())) continue;
    return true;
  }
  return false;
}

function hasComparison(text: string): boolean {
  return /\b(than|compared to|versus|vs\.?|while|unlike|whereas|more than|less than|bigger|smaller|larger|faster|slower|same as|equivalent|equal to)\b/i.test(text);
}

function hasDate(text: string): boolean {
  return /\b(1[0-9]{3}|20[0-9]{2})\b/.test(text) ||
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text);
}

function hasValueSignal(text: string): boolean {
  return hasNumber(text) || hasProperNoun(text) || hasComparison(text) || hasDate(text);
}

function getContentWords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'and', 'or', 'but', 'not', 'no', 'if', 'so', 'as', 'it',
    'you', 'your', 'they', 'their', 'this', 'that', 'who', 'what',
    'its', 'has', 'had', 'have', 'been', 'will', 'would', 'could',
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

function abstractRatio(text: string): number {
  const words = getContentWords(text);
  if (words.length === 0) return 0;
  const abstractCount = words.filter(w => ABSTRACT_WORDS.has(w)).length;
  return abstractCount / words.length;
}

function extractTopicKeywords(topic: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'and', 'or', 'but', 'not', 'no', 'if', 'so', 'as', 'it',
    'about', 'facts', 'things', 'tips', 'guide', 'how', 'what', 'why',
  ]);
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}


// ─── Hard Fail Checks ──────────────────────────────────────────

function checkBannedPhrases(slide: SlideInput): HardFail[] {
  const fullText = `${slide.headline} ${slide.body}`;

  for (const pattern of BANNED_PHRASES) {
    if (pattern.test(fullText)) {
      return [{
        slideIndex: slide.slideNumber,
        type: 'BANNED_PHRASE',
        description: `Contains banned phrase matching: ${pattern.source}`,
      }];
    }
  }
  return [];
}

function checkHeadlineLength(slide: SlideInput): HardFail[] {
  const fails: HardFail[] = [];
  const len = slide.headline.trim().length;

  if (len < 20) {
    fails.push({
      slideIndex: slide.slideNumber,
      type: 'HEADLINE_TOO_SHORT',
      description: `Headline is ${len} chars (minimum 20)`,
    });
  }
  if (len > 100) {
    fails.push({
      slideIndex: slide.slideNumber,
      type: 'HEADLINE_TOO_LONG',
      description: `Headline is ${len} chars (maximum 100)`,
    });
  }
  return fails;
}

function checkBodyLength(slide: SlideInput): HardFail[] {
  const fails: HardFail[] = [];
  const len = slide.body.trim().length;

  if (slide.role === 'FACT') {
    if (len < 200) {
      fails.push({
        slideIndex: slide.slideNumber,
        type: 'BODY_TOO_SHORT',
        description: `FACT body is ${len} chars (minimum 200)`,
      });
    }
    if (len > 400) {
      fails.push({
        slideIndex: slide.slideNumber,
        type: 'BODY_TOO_LONG',
        description: `FACT body is ${len} chars (maximum 400)`,
      });
    }
  }

  if (slide.role === 'OPENER') {
    if (len > 120) {
      fails.push({
        slideIndex: slide.slideNumber,
        type: 'BODY_TOO_LONG',
        description: `OPENER body is ${len} chars (maximum 120)`,
      });
    }
  }

  if (slide.role === 'IMPLICATION') {
    if (len < 50) {
      fails.push({
        slideIndex: slide.slideNumber,
        type: 'BODY_TOO_SHORT',
        description: `IMPLICATION body is ${len} chars (minimum 50)`,
      });
    }
    if (len > 400) {
      fails.push({
        slideIndex: slide.slideNumber,
        type: 'BODY_TOO_LONG',
        description: `IMPLICATION body is ${len} chars (maximum 400)`,
      });
    }
  }

  if (slide.role === 'CTA') {
    if (len < 20) {
      fails.push({
        slideIndex: slide.slideNumber,
        type: 'BODY_TOO_SHORT',
        description: `CTA body is ${len} chars (minimum 20)`,
      });
    }
    if (len > 100) {
      fails.push({
        slideIndex: slide.slideNumber,
        type: 'BODY_TOO_LONG',
        description: `CTA body is ${len} chars (maximum 100)`,
      });
    }
  }

  return fails;
}

function checkValueSignal(slide: SlideInput): HardFail[] {
  if (slide.role !== 'FACT') return [];

  const fullText = `${slide.headline} ${slide.body} ${slide.supportingDetail || ''}`;
  if (!hasValueSignal(fullText)) {
    return [{
      slideIndex: slide.slideNumber,
      type: 'NO_VALUE_SIGNAL',
      description: 'FACT slide has no number, named entity, comparison, or date',
    }];
  }
  return [];
}

function checkHeadlineIsLabel(slide: SlideInput): HardFail[] {
  if (slide.role === 'OPENER' || slide.role === 'CTA') return []; // openers/CTAs can be questions/frames
  if (isLabelHeadline(slide.headline)) {
    return [{
      slideIndex: slide.slideNumber,
      type: 'HEADLINE_IS_LABEL',
      description: `Headline "${slide.headline}" is a category label, not a claim`,
    }];
  }
  return [];
}

function checkImplicationIsCTA(slide: SlideInput): HardFail[] {
  if (slide.role !== 'IMPLICATION') return [];

  const fullText = `${slide.headline} ${slide.body}`;
  for (const pattern of CTA_PATTERNS) {
    if (pattern.test(fullText)) {
      return [{
        slideIndex: slide.slideNumber,
        type: 'IMPLICATION_IS_CTA',
        description: `IMPLICATION contains CTA language: ${pattern.source}`,
      }];
    }
  }
  return [];
}

function checkImplicationIsFormula(slide: SlideInput): HardFail[] {
  if (slide.role !== 'IMPLICATION') return [];

  // Catch the "From X to Y, ..." formula that LLMs default to for synthesis
  const bodyStart = slide.body.trim();
  if (/^from .{3,30} to .{3,30},/i.test(bodyStart)) {
    return [{
      slideIndex: slide.slideNumber,
      type: 'IMPLICATION_IS_FORMULA',
      description: 'IMPLICATION body starts with "From X to Y, ..." — write a conclusion, not a list',
    }];
  }
  return [];
}

const CTA_GENERIC_PATTERNS: RegExp[] = [
  /\bfollow us for more\b/i,
  /\bdon'?t forget to like\b/i,
  /\bshare this post\b/i,
  /\blike and subscribe\b/i,
  /\btag a friend\b/i,
  /\bcomment below\b/i,
  /\blink in bio\b/i,
  /\bturn on notifications\b/i,
  /\bhit the follow\b/i,
  /\bsmash that\b/i,
  /\bdouble tap\b/i,
  /\bsave this for later\b/i,
];

function checkCTAGenericPhrase(slide: SlideInput): HardFail[] {
  if (slide.role !== 'CTA') return [];

  const fullText = `${slide.headline} ${slide.body}`;
  for (const pattern of CTA_GENERIC_PATTERNS) {
    if (pattern.test(fullText)) {
      return [{
        slideIndex: slide.slideNumber,
        type: 'CTA_GENERIC_PHRASE',
        description: `CTA contains generic phrase: ${pattern.source}`,
      }];
    }
  }
  return [];
}

// ─── CTA Action Verb Check ──────────────────────────────────────

const CTA_ACTION_VERBS = /\b(save|follow|share|comment|subscribe|learn|discover|explore|swipe|tap|check|grab|join|try|read|watch|listen|start|get|see|find|click|visit|bookmark|sign\s+up|tag)\b/i;

function checkCTAActionVerb(slide: SlideInput): HardFail[] {
  if (slide.role !== 'CTA') return [];

  const fullText = `${slide.headline} ${slide.body}`;
  if (!CTA_ACTION_VERBS.test(fullText)) {
    return [{
      slideIndex: slide.slideNumber,
      type: 'CTA_MISSING_ACTION_VERB',
      description: 'CTA must include an action verb (e.g., save, follow, comment, learn)',
    }];
  }
  return [];
}

// ─── CTA Factual Content Check ──────────────────────────────────

function checkCTAIntroducesFacts(slide: SlideInput): HardFail[] {
  if (slide.role !== 'CTA') return [];

  const body = slide.body;
  // CTA body should NOT contain numbers with context, dates, or named comparisons
  // that look like new factual content (not just referencing the carousel topic)
  const hasNewNumber = hasNumber(body) && body.length > 40;
  const hasNewDate = hasDate(body);
  const hasNewComparison = /\b(than|compared to|versus|vs\.?)\b/i.test(body) && body.length > 50;

  if (hasNewNumber || hasNewDate || hasNewComparison) {
    return [{
      slideIndex: slide.slideNumber,
      type: 'CTA_INTRODUCES_FACTS',
      description: 'CTA must NOT introduce new factual content (numbers, dates, comparisons)',
    }];
  }
  return [];
}

const VALID_FACT_TYPES = new Set([
  'statistic', 'comparison', 'mechanism', 'historical', 'example', 'definition',
]);

function checkFactType(slide: SlideInput): HardFail[] {
  if (slide.role !== 'FACT') return [];
  if (!slide.factType) {
    return [{
      slideIndex: slide.slideNumber,
      type: 'FACT_MISSING_FACT_TYPE',
      description: 'FACT slide has no factType classification',
    }];
  }
  if (!VALID_FACT_TYPES.has(slide.factType)) {
    return [{
      slideIndex: slide.slideNumber,
      type: 'FACT_MISSING_FACT_TYPE',
      description: `FACT slide has invalid factType "${slide.factType}" — must be one of: ${[...VALID_FACT_TYPES].join(', ')}`,
    }];
  }
  return [];
}

function checkTopicRelevance(slide: SlideInput, topicKeywords: string[]): HardFail[] {
  if (slide.role === 'IMPLICATION' || slide.role === 'CTA') return []; // implication synthesizes, CTA drives follows — may not name topic directly
  if (topicKeywords.length === 0) return [];

  // If the slide has a topicEntity assigned, the model is asserting relevance.
  // A populated topicEntity means the slide is about a specific entity within the domain.
  // This eliminates false positives where topic keywords differ from entity names
  // (e.g., topic "Harry Potter facts" but slide mentions "Hogwarts" or "Moaning Myrtle").
  if (slide.topicEntity && slide.topicEntity.trim().length > 0) return [];

  const fullText = `${slide.headline} ${slide.body} ${slide.supportingDetail || ''}`.toLowerCase();
  const hasKeyword = topicKeywords.some(kw => fullText.includes(kw));

  if (!hasKeyword) {
    return [{
      slideIndex: slide.slideNumber,
      type: 'TOPIC_DRIFT',
      description: `No topic keywords found and no topicEntity set. Expected at least one of: ${topicKeywords.slice(0, 5).join(', ')}`,
    }];
  }
  return [];
}

function checkDuplication(slides: SlideInput[]): HardFail[] {
  const fails: HardFail[] = [];
  const factSlides = slides.filter(s => s.role === 'FACT');

  for (let i = 0; i < factSlides.length; i++) {
    for (let j = i + 1; j < factSlides.length; j++) {
      const a = factSlides[i];
      const b = factSlides[j];

      // Check 1: Body text similarity
      const sim = jaccardSimilarity(a.body, b.body);
      if (sim > 0.4) {
        fails.push({
          slideIndex: b.slideNumber,
          type: 'DUPLICATE_SLIDE',
          description: `Body is ${Math.round(sim * 100)}% similar to slide ${a.slideNumber} (threshold: 40%)`,
        });
        continue; // don't double-flag
      }

      // Check 2: Same topicEntity + similar headlines
      if (a.topicEntity && b.topicEntity &&
          a.topicEntity.toLowerCase() === b.topicEntity.toLowerCase()) {
        const headlineSim = jaccardSimilarity(a.headline, b.headline);
        if (headlineSim > 0.3) {
          fails.push({
            slideIndex: b.slideNumber,
            type: 'DUPLICATE_SLIDE',
            description: `Same entity "${a.topicEntity}" as slide ${a.slideNumber} with similar headline`,
          });
        }
      }
    }
  }

  return fails;
}


// ─── Soft Scoring Checks ────────────────────────────────────────

function checkAbstractRatio(slide: SlideInput): SoftFlag[] {
  if (slide.role === 'OPENER') return []; // openers can be more abstract

  const ratio = abstractRatio(slide.body);
  if (ratio > 0.35) {
    return [{
      slideIndex: slide.slideNumber,
      type: 'HIGH_ABSTRACT_RATIO',
      description: `Body is ${Math.round(ratio * 100)}% abstract words (threshold: 35%)`,
      penalty: ratio > 0.5 ? 10 : 5,
    }];
  }
  return [];
}

function checkNumberPresence(slide: SlideInput): SoftFlag[] {
  if (slide.role !== 'FACT') return [];

  const flags: SoftFlag[] = [];
  const bodyHasNumber = hasNumber(slide.body) || hasNumber(slide.supportingDetail || '');

  if (!bodyHasNumber) {
    flags.push({
      slideIndex: slide.slideNumber,
      type: 'NO_NUMBER',
      description: 'FACT slide has no numbers (preferred but not required)',
      penalty: 3,
    });
  }

  // Cross-check model's self-report
  if (slide.containsNumber && !bodyHasNumber) {
    flags.push({
      slideIndex: slide.slideNumber,
      type: 'NUMBER_SELF_REPORT_MISMATCH',
      description: 'Model reported containsNumber=true but no number detected',
      penalty: 5,
    });
  }
  if (!slide.containsNumber && bodyHasNumber) {
    flags.push({
      slideIndex: slide.slideNumber,
      type: 'NUMBER_SELF_REPORT_MISMATCH',
      description: 'Model reported containsNumber=false but number was detected',
      penalty: 2,
    });
  }

  return flags;
}

function checkSelfReportedScores(slide: SlideInput): SoftFlag[] {
  const flags: SoftFlag[] = [];

  if (slide.role === 'FACT' && slide.concretenessScore <= 2) {
    flags.push({
      slideIndex: slide.slideNumber,
      type: 'LOW_CONCRETENESS_SELF_REPORT',
      description: `Model self-rated concreteness at ${slide.concretenessScore}/5`,
      penalty: 5,
    });
  }

  if (slide.role === 'FACT' && slide.noveltyScore <= 2) {
    flags.push({
      slideIndex: slide.slideNumber,
      type: 'LOW_NOVELTY_SELF_REPORT',
      description: `Model self-rated novelty at ${slide.noveltyScore}/5`,
      penalty: 3,
    });
  }

  return flags;
}

// Abstract nouns that signal padding when they follow "This" at the start of a sentence
const FILLER_NOUNS = new Set([
  'achievement', 'ability', 'approach', 'breakthrough', 'commitment',
  'contribution', 'decline', 'development', 'discovery', 'effort',
  'expansion', 'feat', 'finding', 'growth', 'impact', 'improvement',
  'increase', 'innovation', 'investment', 'milestone', 'move',
  'phenomenon', 'practice', 'progress', 'reduction', 'result',
  'rise', 'shift', 'success', 'surge', 'transformation', 'transition',
  'trend', 'triumph',
]);

function checkTrailingFiller(slide: SlideInput): SoftFlag[] {
  if (slide.role !== 'FACT') return [];
  if (!slide.body || slide.body.length < 40) return [];

  // Split body into sentences (rough split on . ! ?)
  const sentences = slide.body
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  if (sentences.length < 2) return [];

  const lastSentence = sentences[sentences.length - 1];

  // Check if last sentence starts with "This [abstract noun]"
  const match = lastSentence.match(/^this\s+(\w+)/i);
  if (!match) return [];

  const noun = match[1].toLowerCase();
  if (!FILLER_NOUNS.has(noun)) return [];

  // If the last sentence also contains a number, date, or proper noun, it might be substantive
  if (hasNumber(lastSentence) || hasDate(lastSentence)) return [];
  // Check for proper nouns (non-first position since "This" is first)
  if (hasProperNoun(lastSentence)) return [];

  return [{
    slideIndex: slide.slideNumber,
    type: 'TRAILING_FILLER',
    description: `Body ends with filler: "${lastSentence.slice(0, 60)}..."`,
    penalty: 5,
  }];
}

function checkEntityDiversity(
  slides: SlideInput[],
  mode?: 'single_entity' | 'thematic_collection',
  concept?: string,
): SoftFlag[] {
  const factSlides = slides.filter(s => s.role === 'FACT' && s.topicEntity);
  if (factSlides.length === 0) return [];

  const entities = factSlides.map(s => s.topicEntity!.toLowerCase());
  const unique = new Set(entities);

  // In single_entity mode, all slides SHOULD share the entity — overlap is expected.
  // Only flag if the repeated entity is the broad TOPIC name (not the concept),
  // which means the model used the topic label instead of the specific entity.
  if (mode === 'single_entity' && concept) {
    const conceptLower = concept.toLowerCase();
    for (const entity of unique) {
      const count = entities.filter(e => e === entity).length;
      // If most slides use the topic name as entity but it's different from the concept,
      // the model didn't narrow properly. If they use the concept name, that's correct.
      if (count > Math.ceil(factSlides.length / 2) && entity !== conceptLower) {
        // Check if entity is a fragment of the concept (e.g., entity "myrtle" for concept "moaning myrtle")
        const isConceptFragment = conceptLower.includes(entity) || entity.includes(conceptLower);
        if (!isConceptFragment) {
          return [{
            slideIndex: -1,
            type: 'ENTITY_OVERLAP',
            description: `${count}/${factSlides.length} FACT slides reference "${entity}" instead of concept "${concept}"`,
            penalty: 8,
          }];
        }
      }
    }
    return [];
  }

  // In thematic_collection mode or no mode: flag if >50% share the same entity
  for (const entity of unique) {
    const count = entities.filter(e => e === entity).length;
    if (count > Math.ceil(factSlides.length / 2)) {
      return [{
        slideIndex: -1,
        type: 'ENTITY_OVERLAP',
        description: `${count}/${factSlides.length} FACT slides reference "${entity}" — low entity diversity`,
        penalty: 8,
      }];
    }
  }
  return [];
}

// ─── Mode-Specific Cohesion Checks ──────────────────────────

function checkSingleEntityCohesion(
  slides: SlideInput[],
  concept: string,
): SoftFlag[] {
  // Split concept into fragments for flexible matching
  // "Moaning Myrtle" → ["moaning", "myrtle"]
  // "The Sorting Hat" → ["sorting", "hat"]
  const fragments = concept
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length >= 3);

  if (fragments.length === 0) return [];

  const factSlides = slides.filter(s => s.role === 'FACT');
  const driftingSlides: number[] = [];

  for (const slide of factSlides) {
    const fullText = `${slide.headline} ${slide.body} ${slide.supportingDetail || ''}`.toLowerCase();
    const entityText = (slide.topicEntity || '').toLowerCase();

    const hasFragmentInText = fragments.some(f => fullText.includes(f));
    const hasFragmentInEntity = fragments.some(f => entityText.includes(f));

    if (!hasFragmentInText && !hasFragmentInEntity) {
      driftingSlides.push(slide.slideNumber);
    }
  }

  // One slide without mention is natural (may use pronouns/shorthands).
  // Two or more is drift.
  if (driftingSlides.length >= 2) {
    return [{
      slideIndex: -1,
      type: 'ENTITY_DRIFT',
      description: `${driftingSlides.length}/${factSlides.length} FACT slides don't mention "${concept}" — possible entity drift on slides [${driftingSlides.join(', ')}]`,
      penalty: driftingSlides.length * 5,
    }];
  }

  return [];
}

function checkThematicCohesion(
  slides: SlideInput[],
  concept: string,
): SoftFlag[] {
  const flags: SoftFlag[] = [];

  // Extract keyword fragments from the theme concept
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'and', 'or', 'but', 'not', 'no', 'if', 'so', 'as', 'it',
    'that', 'which', 'who', 'what', 'how', 'why', 'where', 'when',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'can', 'could', 'should', 'may', 'might', 'most', 'more',
    'about', 'facts', 'things', 'people', 'them', 'their', 'these',
  ]);

  const conceptWords = concept
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));

  // Theme-fit check: do slides contain theme keywords?
  if (conceptWords.length > 0) {
    const factSlides = slides.filter(s => s.role === 'FACT');
    const offThemeSlides: number[] = [];

    for (const slide of factSlides) {
      const fullText = `${slide.headline} ${slide.body} ${slide.supportingDetail || ''}`.toLowerCase();
      const hasConceptWord = conceptWords.some(w => fullText.includes(w));
      if (!hasConceptWord) {
        offThemeSlides.push(slide.slideNumber);
      }
    }

    // One miss might use synonyms. Two or more is drift.
    if (offThemeSlides.length >= 2) {
      flags.push({
        slideIndex: -1,
        type: 'ENTITY_DRIFT',
        description: `${offThemeSlides.length}/${factSlides.length} FACT slides have no theme keywords from "${concept}" — possible theme drift on slides [${offThemeSlides.join(', ')}]`,
        penalty: offThemeSlides.length * 5,
      });
    }
  }

  // Item uniqueness check: each FACT slide should feature a different item
  const factSlides = slides.filter(s => s.role === 'FACT');
  const entities = factSlides
    .filter(s => s.topicEntity)
    .map(s => s.topicEntity!.toLowerCase());
  const seen = new Set<string>();
  for (let i = 0; i < entities.length; i++) {
    if (seen.has(entities[i])) {
      flags.push({
        slideIndex: factSlides[i].slideNumber,
        type: 'ENTITY_DRIFT',
        description: `Duplicate item "${entities[i]}" — thematic collections need distinct items per slide`,
        penalty: 10,
      });
    }
    seen.add(entities[i]);
  }

  return flags;
}

function checkModeCohesion(
  slides: SlideInput[],
  mode: 'single_entity' | 'thematic_collection',
  concept: string,
): SoftFlag[] {
  if (mode === 'single_entity') {
    return checkSingleEntityCohesion(slides, concept);
  }
  return checkThematicCohesion(slides, concept);
}

function checkRepeatedPhrases(slides: SlideInput[]): SoftFlag[] {
  const bodies = slides
    .filter(s => s.role === 'FACT')
    .map(s => s.body);

  if (bodies.length < 2) return [];

  const repeated = findRepeatedPhrases(bodies, 4); // 4-word phrases

  if (repeated.size > 0) {
    const worst = [...repeated.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([phrase, count]) => `"${phrase}" (${count}x)`)
      .join(', ');

    return [{
      slideIndex: -1,
      type: 'REPEATED_PHRASE',
      description: `Repeated phrases across FACT slides: ${worst}`,
      penalty: Math.min(repeated.size * 3, 15),
    }];
  }
  return [];
}

function checkImplicationSynthesis(slides: SlideInput[]): SoftFlag[] {
  const implication = slides.find(s => s.role === 'IMPLICATION');
  if (!implication) return [];

  const factEntities = slides
    .filter(s => s.role === 'FACT' && s.topicEntity)
    .map(s => s.topicEntity!.toLowerCase());

  if (factEntities.length < 3) return []; // not enough facts to expect synthesis

  const impText = `${implication.headline} ${implication.body}`.toLowerCase();
  const referencedEntities = factEntities.filter(e => impText.includes(e));

  if (referencedEntities.length < 2) {
    return [{
      slideIndex: implication.slideNumber,
      type: 'IMPLICATION_WEAK_SYNTHESIS',
      description: `IMPLICATION references ${referencedEntities.length} fact entities (expected 2+)`,
      penalty: 8,
    }];
  }
  return [];
}

function checkImplicationIsListing(slides: SlideInput[]): SoftFlag[] {
  const implication = slides.find(s => s.role === 'IMPLICATION');
  if (!implication) return [];

  const factEntities = slides
    .filter(s => s.role === 'FACT' && s.topicEntity)
    .map(s => s.topicEntity!.toLowerCase());

  const uniqueFactEntities = [...new Set(factEntities)];
  if (uniqueFactEntities.length < 4) return []; // not enough distinct entities to detect listing

  const impText = `${implication.headline} ${implication.body}`.toLowerCase();
  const mentioned = uniqueFactEntities.filter(e => impText.includes(e));

  // If the implication mentions 4+ distinct fact entities, it's likely listing, not concluding.
  // A strong implication references 2-3 anchors and draws a non-obvious connection.
  if (mentioned.length >= 4) {
    return [{
      slideIndex: implication.slideNumber,
      type: 'IMPLICATION_IS_LISTING',
      description: `IMPLICATION mentions ${mentioned.length}/${uniqueFactEntities.length} fact entities — reads as a list, not a conclusion`,
      penalty: 8,
    }];
  }
  return [];
}

function checkTopicConfidence(carousel: CarouselInput): SoftFlag[] {
  if (carousel.topicConfidence <= 5) {
    return [{
      slideIndex: -1,
      type: 'LOW_TOPIC_CONFIDENCE',
      description: `Model self-rated topic confidence at ${carousel.topicConfidence}/10`,
      penalty: 5,
    }];
  }
  return [];
}


// ─── Main Validator ─────────────────────────────────────────────

export function validateCarousel(
  carousel: CarouselInput,
  topic: string,
  mode?: 'single_entity' | 'thematic_collection',
  concept?: string,
): CarouselValidationReport {
  const topicKeywords = extractTopicKeywords(topic);
  const allHardFails: HardFail[] = [];
  const allSoftFlags: SoftFlag[] = [];
  const slideResults: SlideResult[] = [];

  // ── Per-slide checks ──────────────────────────────────────

  for (const slide of carousel.slides) {
    const hardFails: HardFail[] = [
      ...checkBannedPhrases(slide),
      ...checkHeadlineLength(slide),
      ...checkBodyLength(slide),
      ...checkValueSignal(slide),
      ...checkHeadlineIsLabel(slide),
      ...checkImplicationIsCTA(slide),
      ...checkImplicationIsFormula(slide),
      ...checkFactType(slide),
      ...checkTopicRelevance(slide, topicKeywords),
      ...checkCTAGenericPhrase(slide),
      ...checkCTAActionVerb(slide),
      ...checkCTAIntroducesFacts(slide),
    ];

    const softFlags: SoftFlag[] = [
      ...checkAbstractRatio(slide),
      ...checkNumberPresence(slide),
      ...checkSelfReportedScores(slide),
      ...checkTrailingFiller(slide),
    ];

    allHardFails.push(...hardFails);
    allSoftFlags.push(...softFlags);

    slideResults.push({
      slideIndex: slide.slideNumber,
      role: slide.role,
      passed: hardFails.length === 0,
      hardFails,
      softFlags,
    });
  }

  // ── Cross-slide checks ────────────────────────────────────

  const dupFails = checkDuplication(carousel.slides);
  allHardFails.push(...dupFails);

  // Mark duplicated slides as failed in their slide results
  for (const fail of dupFails) {
    const result = slideResults.find(r => r.slideIndex === fail.slideIndex);
    if (result) {
      result.hardFails.push(fail);
      result.passed = false;
    }
  }

  const crossSlideFlags: SoftFlag[] = [
    ...checkEntityDiversity(carousel.slides, mode, concept),
    ...checkRepeatedPhrases(carousel.slides),
    ...checkImplicationSynthesis(carousel.slides),
    ...checkImplicationIsListing(carousel.slides),
    ...(mode && concept ? checkModeCohesion(carousel.slides, mode, concept) : []),
    ...checkTopicConfidence(carousel),
  ];
  allSoftFlags.push(...crossSlideFlags);

  // ── Compute score ─────────────────────────────────────────

  const totalPenalty = allSoftFlags.reduce((sum, f) => sum + f.penalty, 0);
  const score = Math.max(0, Math.min(100, 100 - totalPenalty));

  // ── Identify slides to regenerate ─────────────────────────

  const slidesToRegenerate = slideResults
    .filter(r => !r.passed)
    .map(r => r.slideIndex);

  return {
    passed: allHardFails.length === 0,
    score,
    slideResults,
    hardFails: allHardFails,
    softFlags: allSoftFlags,
    slidesToRegenerate,
  };
}


// ─── Convenience Exports ────────────────────────────────────────

export function getFailingSlidesWithReasons(
  report: CarouselValidationReport,
): Array<{ slideIndex: number; reasons: Array<{ type: string; description: string }> }> {
  return report.slideResults
    .filter(r => !r.passed)
    .map(r => ({
      slideIndex: r.slideIndex,
      reasons: r.hardFails.map(f => ({ type: f.type, description: f.description })),
    }));
}

export type {
  CarouselValidationReport,
  HardFail,
  SoftFlag,
  SlideResult,
  HardFailType,
  SoftFlagType,
  SlideInput,
  CarouselInput,
};
