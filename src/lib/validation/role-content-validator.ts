/**
 * Role-Content Validator — Hard enforcement of slide role constraints.
 *
 * Each role has non-negotiable content rules that cannot be overridden
 * by quality gates or prompts. This is the last line of defense.
 *
 * Called AFTER all quality gates but BEFORE image rendering.
 */

// ─── Types ──────────────────────────────────────────────────────

interface SlideInput {
  slideNumber: number;
  role: string;
  headline: string;
  body: string;
  supportingDetail?: string | null;
  factType?: string | null;
  containsNumber?: boolean;
  topicEntity?: string | null;
}

export interface RoleContentFailure {
  slideIndex: number;
  role: string;
  rule: string;
  detail: string;
}

export interface RoleContentReport {
  passed: boolean;
  failures: RoleContentFailure[];
}

// ─── Detection Helpers ──────────────────────────────────────────

const ACTION_VERBS = /\b(save|follow|share|comment|subscribe|learn|discover|explore|swipe|tap|check|grab|join|try|read|watch|listen|start|get|see|find|click|visit|bookmark|sign\s+up|tag|uncover|dive)\b/i;

/** Vague headline patterns — abstract framing instead of concrete claims */
const VAGUE_HEADLINE_PATTERNS: RegExp[] = [
  /^the (duality|balance|power|energy|harmony|essence|mystery|secret|truth|beauty|force) of/i,
  /^(discover|explore|unlock|embrace) the/i,
  /^the (hidden|real|deeper|true) (meaning|truth|secret|power|story)/i,
  /embodies the/i,
  /represents the essence/i,
  /the cosmic/i,
  /^(a|the) journey (through|into|of)/i,
];

/**
 * Abstract mythic/spiritual phrases that sound poetic but carry zero
 * verifiable information. Caught in headlines AND bodies.
 */
const ABSTRACT_MYTHIC_PHRASES: RegExp[] = [
  /more than (just )?(light|darkness|a? ?symbol|a? ?myth|a? ?legend|a? ?story)/i,
  /guide[sd]?\s+(the\s+)?(realms?|souls?|spirits?|dead|living|mortals?)/i,
  /from\s+(the\s+)?underworld\s+to\s+(the\s+)?(life|light|surface|earth)/i,
  /trusted\s+(power|force|authority|wisdom)/i,
  /commands?\s+(the\s+)?(spirits?|elements?|forces?|winds?|seas?|dead)/i,
  /bridge\s+between\s+(life|death|worlds?|realms?|light|darkness)/i,
  /eternal\s+(struggle|battle|conflict|dance|cycle)\s+(between|of)/i,
  /embod(y|ies|ied)\s+(the\s+)?(spirit|essence|power|force|duality|balance)/i,
  /symbol\s+of\s+(power|strength|wisdom|justice|truth|life|death|hope)/i,
  /represents?\s+(the\s+)?(power|force|balance|duality|harmony|cycle)/i,
  /wield(s|ed)?\s+(the\s+)?(power|force|authority|might)\s+of/i,
  /master(s|ed)?\s+(the\s+)?(elements?|forces?|realms?|domains?)/i,
  /ruled?\s+(over\s+)?(the\s+)?(realms?|domains?|worlds?)\s+(of|with)/i,
  /connection\s+(between|to)\s+(the\s+)?(divine|mortal|spiritual|earthly)/i,
];

const FACTUAL_SIGNAL = /\b\d[\d,.]*[%xMBKT]?\b|\$\d|\b\d+(st|nd|rd|th)\b|\b(1[0-9]{3}|20[0-9]{2})\b/;

const COMPARISON_SIGNAL = /\b(than|compared to|versus|vs\.?|while|unlike|whereas|more than|less than|bigger|smaller|larger|faster|slower)\b/i;

function hasNamedEntity(text: string): boolean {
  const words = text.split(/\s+/);
  const starters = new Set([
    'the', 'this', 'that', 'these', 'those', 'there', 'they', 'their',
    'when', 'where', 'what', 'which', 'who', 'it', 'its', 'our', 'your',
    'and', 'but', 'yet', 'for', 'not', 'one', 'each', 'every', 'some',
    'if', 'as', 'at', 'by', 'in', 'on', 'to', 'of',
  ]);
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/[^a-zA-Z]/g, '');
    if (w.length <= 1) continue;
    if (!/^[A-Z][a-z]/.test(w)) continue;
    if (i === 0 && starters.has(w.toLowerCase())) continue;
    return true;
  }
  return false;
}

function hasConcreteAnchor(text: string): boolean {
  return FACTUAL_SIGNAL.test(text) || hasNamedEntity(text) || COMPARISON_SIGNAL.test(text);
}

// ─── Role Validators ────────────────────────────────────────────

function validateCTA(slide: SlideInput): RoleContentFailure[] {
  const failures: RoleContentFailure[] = [];
  const fullText = `${slide.headline} ${slide.body}`;

  // CTA must have an action verb
  if (!ACTION_VERBS.test(fullText)) {
    failures.push({
      slideIndex: slide.slideNumber,
      role: 'CTA',
      rule: 'CTA_REQUIRES_ACTION_VERB',
      detail: 'CTA must contain at least one action verb (save, follow, comment, learn, etc.)',
    });
  }

  // CTA must NOT introduce new factual content
  const bodyOnly = slide.body;
  const hasNewNumber = FACTUAL_SIGNAL.test(bodyOnly) && bodyOnly.length > 40;
  const hasNewComparison = COMPARISON_SIGNAL.test(bodyOnly) && bodyOnly.length > 50;
  if (hasNewNumber || hasNewComparison) {
    failures.push({
      slideIndex: slide.slideNumber,
      role: 'CTA',
      rule: 'CTA_NO_NEW_FACTS',
      detail: 'CTA must not introduce new factual content (numbers, dates, comparisons)',
    });
  }

  // CTA must NOT read like a FACT slide (teaching something)
  // A CTA headline that makes a factual claim is really a FACT, not a CTA
  const headlineLen = slide.headline.length;
  const bodyLen = slide.body.length;
  if (bodyLen > 100 && headlineLen > 60) {
    // Both headline and body are substantial — this is content, not a call-to-action
    failures.push({
      slideIndex: slide.slideNumber,
      role: 'CTA',
      rule: 'CTA_IS_FACTUAL_CONTENT',
      detail: `CTA has ${headlineLen}-char headline + ${bodyLen}-char body — this reads as factual content, not a call to action`,
    });
  }

  // CTA body must be concise (≤100 chars)
  if (bodyLen > 120) {
    failures.push({
      slideIndex: slide.slideNumber,
      role: 'CTA',
      rule: 'CTA_BODY_TOO_LONG',
      detail: `CTA body is ${bodyLen} chars — max 120. CTAs drive action, not teach.`,
    });
  }

  // CTA must not contain abstract mythic phrases
  const mythicCheck = checkAbstractMythicPhrases(slide);
  if (mythicCheck) failures.push(mythicCheck);

  return failures;
}

function validateFACT(slide: SlideInput): RoleContentFailure[] {
  const failures: RoleContentFailure[] = [];
  const fullText = `${slide.headline} ${slide.body} ${slide.supportingDetail || ''}`;

  // FACT must not use vague/abstract framing
  const vagueCheck = checkVagueHeadline(slide);
  if (vagueCheck) failures.push(vagueCheck);

  // FACT must not contain abstract mythic phrases
  const mythicCheck = checkAbstractMythicPhrases(slide);
  if (mythicCheck) failures.push(mythicCheck);

  // FACT must contain a concrete claim with at least one anchor
  if (!hasConcreteAnchor(fullText)) {
    failures.push({
      slideIndex: slide.slideNumber,
      role: 'FACT',
      rule: 'FACT_REQUIRES_CONCRETE_CLAIM',
      detail: 'FACT slide must contain at least one number, named entity, date, or comparison',
    });
  }

  // FACT headline must be a claim, not a label
  const headlineWords = slide.headline.trim().split(/\s+/).length;
  const hasVerb = /\b(is|are|was|were|has|had|have|did|does|do|made|built|created|killed|caused|changed|became|took|gave|lost|won|found|used|produced|held|costs?|averag|last|contain|weigh|measur|reach|exceed|outperform|surpass|beat|ban|stopp|prevent|allow|requir|prov|show|reveal|discover|invent)\w*\b/i.test(slide.headline);
  if (headlineWords <= 3 && !hasVerb) {
    failures.push({
      slideIndex: slide.slideNumber,
      role: 'FACT',
      rule: 'FACT_HEADLINE_IS_LABEL',
      detail: `Headline "${slide.headline}" is a label, not a factual claim`,
    });
  }

  // FACT body must have minimum substance
  if (slide.body.length < 100) {
    failures.push({
      slideIndex: slide.slideNumber,
      role: 'FACT',
      rule: 'FACT_BODY_TOO_SHORT',
      detail: `FACT body is ${slide.body.length} chars — minimum 100 for substantive content`,
    });
  }

  // FACT must have a factType
  const validTypes = new Set(['statistic', 'comparison', 'mechanism', 'historical', 'example', 'definition']);
  if (!slide.factType || !validTypes.has(slide.factType)) {
    failures.push({
      slideIndex: slide.slideNumber,
      role: 'FACT',
      rule: 'FACT_REQUIRES_FACT_TYPE',
      detail: `FACT slide must have a valid factType (got: ${slide.factType || 'null'})`,
    });
  }

  return failures;
}

/**
 * Detect abstract mythic/spiritual phrases in headline or body.
 * These phrases sound poetic but are not verifiable claims.
 * A phrase is only flagged if the surrounding sentence has no concrete anchor
 * (number, named entity, date) — allowing "Hermes guided 3,000 souls" but
 * blocking "Hermes guided the realms of the dead."
 */
function checkAbstractMythicPhrases(slide: SlideInput): RoleContentFailure | null {
  const fullText = `${slide.headline} ${slide.body}`;

  for (const pattern of ABSTRACT_MYTHIC_PHRASES) {
    const match = fullText.match(pattern);
    if (match) {
      // Extract the sentence containing the match
      const matchIdx = fullText.indexOf(match[0]);
      const sentenceStart = fullText.lastIndexOf('.', matchIdx) + 1;
      const sentenceEnd = fullText.indexOf('.', matchIdx + match[0].length);
      const sentence = fullText.slice(
        sentenceStart,
        sentenceEnd > 0 ? sentenceEnd : undefined,
      ).trim();

      // If the sentence also has a concrete anchor, allow it
      if (FACTUAL_SIGNAL.test(sentence)) continue;

      return {
        slideIndex: slide.slideNumber,
        role: slide.role,
        rule: 'ABSTRACT_MYTHIC_PHRASE',
        detail: `"${match[0]}" is abstract mythic phrasing with no concrete anchor in the same sentence`,
      };
    }
  }
  return null;
}

function checkVagueHeadline(slide: SlideInput): RoleContentFailure | null {
  for (const pattern of VAGUE_HEADLINE_PATTERNS) {
    if (pattern.test(slide.headline)) {
      return {
        slideIndex: slide.slideNumber,
        role: slide.role,
        rule: 'VAGUE_HEADLINE',
        detail: `Headline "${slide.headline}" uses abstract framing instead of a concrete claim`,
      };
    }
  }
  return null;
}

function validateOPENER(slide: SlideInput): RoleContentFailure[] {
  const failures: RoleContentFailure[] = [];

  // OPENER must not use vague/abstract framing
  const vagueCheck = checkVagueHeadline(slide);
  if (vagueCheck) failures.push(vagueCheck);

  // OPENER must not contain abstract mythic phrases
  const mythicCheck = checkAbstractMythicPhrases(slide);
  if (mythicCheck) failures.push(mythicCheck);

  // OPENER must function as a hook — must have a concrete anchor
  if (!hasConcreteAnchor(slide.headline)) {
    failures.push({
      slideIndex: slide.slideNumber,
      role: 'OPENER',
      rule: 'OPENER_REQUIRES_HOOK_ANCHOR',
      detail: 'OPENER headline must contain at least one number, named entity, or comparison to function as a hook',
    });
  }

  // OPENER headline must be concise (6-15 words for thumb-stop)
  const wordCount = slide.headline.trim().split(/\s+/).length;
  if (wordCount > 15) {
    failures.push({
      slideIndex: slide.slideNumber,
      role: 'OPENER',
      rule: 'OPENER_HEADLINE_TOO_LONG',
      detail: `OPENER headline is ${wordCount} words — max 15 for thumb-stop readability`,
    });
  }

  // OPENER body should be minimal or empty
  if (slide.body.length > 80) {
    failures.push({
      slideIndex: slide.slideNumber,
      role: 'OPENER',
      rule: 'OPENER_BODY_TOO_LONG',
      detail: `OPENER body is ${slide.body.length} chars — max 80. Hook should be in the headline.`,
    });
  }

  return failures;
}

// ─── Main Validator ─────────────────────────────────────────────

export function validateRoleContent(slides: SlideInput[]): RoleContentReport {
  const failures: RoleContentFailure[] = [];

  for (const slide of slides) {
    switch (slide.role) {
      case 'CTA':
        failures.push(...validateCTA(slide));
        break;
      case 'FACT':
        failures.push(...validateFACT(slide));
        break;
      case 'OPENER':
        failures.push(...validateOPENER(slide));
        break;
    }
  }

  if (failures.length > 0) {
    console.warn(`[RoleContentValidator] ${failures.length} failures:`);
    for (const f of failures) {
      console.warn(`  Slide ${f.slideIndex + 1} (${f.role}): ${f.rule} — ${f.detail}`);
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

/**
 * Extract only CTA failures from a role-content report.
 */
export function getCTAFailures(report: RoleContentReport): RoleContentFailure[] {
  return report.failures.filter(f => f.role === 'CTA');
}
