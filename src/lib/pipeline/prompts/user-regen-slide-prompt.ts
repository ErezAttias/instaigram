interface SlideContext {
  slideIndex: number;
  role: string;
  headline: string;
  body: string;
  supportingDetail: string | null;
}

interface UserRegenSlideParams {
  topic: string;
  slides: SlideContext[];
  targetIndex: number;
  targetRole: 'OPENER' | 'FACT' | 'IMPLICATION' | 'CTA';
}

/**
 * Build a prompt for user-initiated single slide regeneration.
 *
 * Different from the pipeline patch prompt:
 * - No failure reasons (the user just wants a different version)
 * - No source fact (mining data isn't cached between requests)
 * - The user expects a visibly different result, not a minor fix
 */
export function buildUserRegenSlidePrompt({
  topic,
  slides,
  targetIndex,
  targetRole,
}: UserRegenSlideParams): string {
  const current = slides.find(s => s.slideIndex === targetIndex);
  if (!current) {
    throw new Error(`Slide at index ${targetIndex} not found in carousel context`);
  }

  const otherSlides = slides
    .filter(s => s.slideIndex !== targetIndex)
    .map(s => `  Slide ${s.slideIndex} (${s.role}): "${s.headline}" — ${s.body}`)
    .join('\n');

  const roleGuidance = targetRole === 'OPENER'
    ? `ROLE REQUIREMENTS:
- headline: 20-100 characters. A topic-level title, NOT a specific fact.
  Format: "[Subject]: [N] [adjective] facts you didn't know"
  Example: "Lions: 4 Amazing Facts You Didn't Know"
- body: Always empty string.
- factType: null
- Must start with the topic/subject name and include the number of fact slides.`
    : targetRole === 'IMPLICATION'
    ? `ROLE REQUIREMENTS:
- headline: 20-100 characters. The "so what" — what changes in the reader's understanding.
- body: 50-400 characters. Synthesize across 2+ facts from the carousel. Not a CTA. Not motivation.
- factType: null
- Must reference or connect 2+ specific facts from the other slides.
- Must NOT contain: "follow", "save this", "share", "subscribe", "comment below".`
    : targetRole === 'CTA'
    ? `ROLE REQUIREMENTS:
- headline: Use EXACTLY this text: "We post only interesting facts!"
- body: Use EXACTLY this text: "Follow us to get fresh facts everyday"
- factType: null
- Do NOT change, rephrase, or customize the CTA text.`
    : `ROLE REQUIREMENTS:
- headline: 20-100 characters. A specific claim, not a category label.
- body: 200-400 characters. Evidence, mechanism, example, or context that makes the headline land.
- supportingDetail: Optional. A single stat, quote, date, or named reference.
- factType: Must be one of: statistic, comparison, mechanism, historical, example, definition
- Body must contain at least one: number, named entity, comparison, or date.
- Must be independently valuable — if posted alone, it should teach something.`;

  return `Write a replacement for slide ${targetIndex} in a carousel about "${topic}".

THE SLIDE TO REPLACE:
  role: ${targetRole}
  headline: "${current.headline}"
  body: "${current.body}"${current.supportingDetail ? `\n  supporting_detail: "${current.supportingDetail}"` : ''}

THE OTHER SLIDES (your replacement must not duplicate any of these):
${otherSlides}

${roleGuidance}

RULES:
- Write about a DIFFERENT aspect of ${topic} than the current slide
- Use DIFFERENT vocabulary and sentence structure
- Do NOT reuse any phrases from the current slide
- headline must be 20-100 characters
- FACT body must be 200-400 characters
- IMPLICATION body must be 50-400 characters
- OPENER body must be 0-120 characters
- CTA headline must be 20-80 characters
- CTA body must be 20-100 characters
- No banned phrases: "most people don't know", "game changer", "the secret is", "hidden truth", etc.

Return exactly one slide:
{
  "slideIndex": ${targetIndex},
  "role": "${targetRole}",
  "headline": "string",
  "body": "string",
  "supportingDetail": "string or null",
  "factType": "statistic" | "comparison" | "mechanism" | "historical" | "example" | "definition" | null,
  "containsNumber": boolean,
  "concretenessScore": 1-5,
  "noveltyScore": 1-5,
  "topicEntity": "string or null",
  "factRefs": []
}`;
}
