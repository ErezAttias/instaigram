import type { MinedFact, CarouselMode } from '@/lib/validation/schemas';

interface CarouselSlideContext {
  slideIndex: number;
  role: string;
  headline: string;
  body: string;
  supportingDetail: string | null;
}

interface PatchSlideTarget {
  slideIndex: number;
  role: 'OPENER' | 'FACT' | 'IMPLICATION' | 'CTA';
  currentHeadline: string;
  currentBody: string;
  failures: Array<{ type: string; description: string }>;
  sourceFact?: MinedFact;
}

interface PatchPromptParams {
  topic: string;
  slides: CarouselSlideContext[];
  targets: PatchSlideTarget[];
  mode?: CarouselMode;
  concept?: string;
}

/**
 * Build a prompt that repairs specific failing slides in an otherwise valid carousel.
 *
 * The model receives the full carousel for context, the specific failures for each
 * target slide, and the original source fact (if available) as raw material.
 * It returns only the replacement slides — not the entire carousel.
 */
export function buildPatchPrompt({
  topic,
  slides,
  targets,
  mode,
  concept,
}: PatchPromptParams): string {
  // Show the full carousel with failing slides marked
  const carouselDisplay = slides.map(s => {
    const isTarget = targets.some(t => t.slideIndex === s.slideIndex);
    const marker = isTarget ? '  ✗ NEEDS REPLACEMENT (see below)' : '';
    return [
      `[Slide ${s.slideIndex}] ${s.role}${marker}`,
      `  headline: ${s.headline}`,
      `  body: ${s.body}`,
      s.supportingDetail ? `  supporting_detail: ${s.supportingDetail}` : null,
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  // Show each target with its failures and source fact
  const targetDetails = targets.map(t => {
    const failureList = t.failures
      .map(f => `  - ${f.type}: ${f.description}`)
      .join('\n');

    const sourceBlock = t.sourceFact
      ? `SOURCE FACT (use this as your raw material):
  claim: ${t.sourceFact.claim}
  evidence: ${t.sourceFact.evidence}
  entities: ${t.sourceFact.entities.join(', ')}`
      : 'No source fact available — write a new fact specific to the topic.';

    return `SLIDE ${t.slideIndex} (${t.role}) — REPLACE THIS
Current headline: "${t.currentHeadline}"
Current body: "${t.currentBody}"

WHY IT FAILED:
${failureList}

${sourceBlock}`;
  }).join('\n\n');

  // Collect headlines/bodies of passing slides for anti-duplication
  const passingContent = slides
    .filter(s => !targets.some(t => t.slideIndex === s.slideIndex))
    .map(s => `  Slide ${s.slideIndex}: "${s.headline}" — ${s.body}`)
    .join('\n');

  return `You are repairing specific slides in a carousel about "${topic}".

Some slides failed quality validation. Your job is to replace ONLY the failing slides.
The passing slides are final — do not modify them. Your replacements must fit alongside them.

═══════════════════════════════════════════
CURRENT CAROUSEL
═══════════════════════════════════════════

${carouselDisplay}

═══════════════════════════════════════════
SLIDES TO REPLACE
═══════════════════════════════════════════

${targetDetails}

═══════════════════════════════════════════
PASSING SLIDES (do not duplicate these)
═══════════════════════════════════════════

${passingContent}

═══════════════════════════════════════════
REPAIR RULES
═══════════════════════════════════════════

1. FIX THE SPECIFIC FAILURE. Read the "WHY IT FAILED" section for each slide.
   - BANNED_PHRASE: Remove the phrase entirely, do not rephrase it
   - NO_VALUE_SIGNAL: The body MUST include a number, named entity, comparison, or date
   - BODY_TOO_SHORT: Write more substance, not padding (FACT minimum: 200 chars, IMPLICATION: 50 chars)
   - BODY_TOO_LONG: Cut to the strongest details, stay under 400 characters (OPENER max: 120 chars)
   - HEADLINE_IS_LABEL: Rewrite the headline as a specific claim with a verb
   - HEADLINE_TOO_SHORT: Expand the headline to at least 20 characters
   - HEADLINE_TOO_LONG: Tighten the headline to under 100 characters
   - DUPLICATE_SLIDE: Write about a different aspect of the topic entirely
   - TOPIC_DRIFT: Anchor every sentence to ${topic}
   - IMPLICATION_IS_CTA: Remove all calls to action, write a synthesis instead
   - IMPLICATION_IS_FORMULA: Do not start with "From X to Y" — state a specific conclusion, not a list of facts
   - FACT_MISSING_FACT_TYPE: Ensure factType is one of: statistic, comparison, mechanism, historical, example, definition

2. DO NOT DUPLICATE passing slides. Your replacement must make a different claim
   about a different aspect of the topic. Check the passing slides list above.

3. USE THE SOURCE FACT if provided. It was selected for quality. Your job is to
   articulate it well, not to invent something new.

4. MATCH THE TONE of the passing slides. Read them. Write like the same author.

5. EACH REPLACEMENT must be independently valuable. The screenshot test:
   "Could someone screenshot this single slide, post it alone, and it teaches something?"
${mode === 'single_entity' && concept ? `
6. ENTITY COHESION: This carousel is about "${concept}". Your replacement must be
   specifically about "${concept}" — not about the broader topic "${topic}" or other
   entities within it. Reference "${concept}" or a recognizable shorthand in the body.
` : ''}${mode === 'thematic_collection' && concept ? `
6. THEME COHESION: This carousel is a themed collection: "${concept}". Your replacement
   must feature a specific item that fits this theme AND is different from items in the
   passing slides. The body must explain how the item connects to "${concept}".
` : ''}
═══════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════

Return ONLY the replacement slides. Do not include passing slides.

{
  "replacements": [
    {
      "slideIndex": number,
      "role": "OPENER" | "FACT" | "IMPLICATION" | "CTA",
      "headline": "string (20-100 chars)",
      "body": "string (FACT: 200-400 chars, IMPLICATION: 50-400 chars, OPENER: 0-120 chars, CTA: 20-100 chars)",
      "supportingDetail": "string or null",
      "factType": "statistic" | "comparison" | "mechanism" | "historical" | "example" | "definition" | null,
      "containsNumber": boolean,
      "concretenessScore": 1-5,
      "noveltyScore": 1-5,
      "topicEntity": "string or null",
      "factRefs": []
    }
  ]
}

Return exactly ${targets.length} replacement(s), one per failing slide, matching the slideIndex values above.`;
}

export type { PatchSlideTarget, CarouselSlideContext, PatchPromptParams };
