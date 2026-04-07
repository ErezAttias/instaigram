import type { GeneratedSlideV2 } from '@/lib/validation/schemas';

interface MicroStoryRegenParams {
  topic: string;
  slide: GeneratedSlideV2;
  currentTitle: string;
  currentSupport: string;
  violations: string[];
  angleDescription?: string;
}

/**
 * Build a targeted regeneration prompt for a single FACT slide
 * that failed paragraph validation.
 *
 * Only regenerates the displaySupport (and optionally displayTitle).
 * Does NOT regenerate the slide body or image.
 */
export function buildMicroStoryRegenPrompt({
  topic,
  slide,
  currentTitle,
  currentSupport,
  violations,
  angleDescription,
}: MicroStoryRegenParams): string {
  const angleBlock = angleDescription
    ? `\nCAROUSEL ANGLE: "${angleDescription}"\nThe rewritten paragraph MUST clearly serve this angle. If the current text is off-angle, reframe it to reinforce the angle.\n`
    : '';

  return `You are fixing a FACT slide for an Instagram carousel about "${topic}".
${angleBlock}
The slide FAILED paragraph validation. You must rewrite ONLY the display text.

═══════════════════════════════════════════
ORIGINAL SLIDE
═══════════════════════════════════════════

headline: ${slide.headline}
body: ${slide.body}

CURRENT (FAILED) display text:
  displayTitle: "${currentTitle}"
  displaySupport: "${currentSupport}"

VIOLATIONS: ${violations.join('; ')}

═══════════════════════════════════════════
FLOWING PARAGRAPH RULES (MANDATORY)
═══════════════════════════════════════════

displaySupport MUST be a SINGLE FLOWING PARAGRAPH of 2–3 connected sentences (max 180 characters total).

THE PARAGRAPH RULE:
  - Sentences MUST connect using causal or explanatory connectives
  - The paragraph must read as ONE cohesive thought, not separate factoids
  - Use connectives: "because", "which", "so", "letting", "making", "meaning",
    "— and", "— so", "since", "thanks to", "allowing"
  - Each sentence should NEED the one before it to make full sense

CONCRETE DETAIL RULE:
  - Must include at least one number, named entity, or specific mechanism
  - Must describe something the reader can picture

REJECT patterns:
  - Disconnected sentences with no causal link
  - Bullet-point-style text ("X. Y. Z." with no connectives)
  - Vague phrasing: "led to chaos", "changed everything", "something happened"
  - Abstract interpretation: "symbolizes...", "represents...", "embodies..."
  - No concrete detail — no number, entity, or mechanism

EXAMPLE (valid):
  displayTitle: "Actaeon's Own Dogs Killed Him"
  displaySupport: "He stumbled on Artemis bathing, so she turned him into a stag on the spot — and his own hunting dogs, unable to recognize him, tore him apart."

EXAMPLE (INVALID — disconnected sentences):
  displaySupport: "He saw Artemis. She cursed him. His dogs killed him."
  → Three separate factoids. No causal flow. Rewrite with connectives.

EXAMPLE (FIXED):
  displaySupport: "After stealing fire from the gods, Zeus chained him to a rock where an eagle devoured his liver every day — only for it to regrow each night."

═══════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════

Return JSON:
{
  "compressed": [
    {
      "slideNumber": ${slide.slideNumber},
      "displayTitle": "5–10 words, keep or improve current title",
      "displaySupport": "A single flowing paragraph of 2–3 connected sentences."
    }
  ]
}

CRITICAL: The displaySupport MUST be a single flowing paragraph (no \\n line breaks). Max 180 characters. Sentences must be connected with causal/explanatory links. Fix the violations listed above.`;
}
