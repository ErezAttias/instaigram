/**
 * Verb Rewrite Prompt — Rewrites a Bold-layout FACT headline to include a real
 * action verb when the deterministic verb-check detected none.
 *
 * Kept deliberately tiny. Small prompts are followed; big ones get diluted.
 */

interface VerbRewriteParams {
  /** The current (broken) headline — a label with no action verb. */
  currentTitle: string;
  /** The full body/fact context (from compose) so the rewrite knows what to say. */
  body: string;
  /** Detected label pattern name (for the reason message). */
  detectedPattern?: string | null;
}

export function buildVerbRewritePrompt({ currentTitle, body, detectedPattern }: VerbRewriteParams): string {
  const patternReason = detectedPattern
    ? `(pattern detected: ${detectedPattern.replace(/_/g, ' ')})`
    : '';

  return `You are rewriting a single Bold-layout Instagram carousel headline.

The current headline is a LABEL, not a claim — it lacks an action verb ${patternReason}.

CURRENT (broken) HEADLINE:
"${currentTitle}"

THE FULL FACT (for context):
"${body}"

TASK:
Rewrite the headline as a COMPLETE SENTENCE with a real action verb (not "is", "of", "in", "as", ":").

RULES:
- 6–16 words
- Subject + action verb + specific object/outcome + surprising detail
- Must stand alone as an interesting fact someone could say aloud
- Keep the same core fact — do not invent new information
- Include the specific number, name, or concrete detail from the original
- Do NOT artificially shorten — use as many words as needed to make the fact interesting

EXAMPLES (BAD → GOOD):
  "Unicorns in the King James Bible"
    → "The King James Bible Mentions Unicorns Nine Times by Name"
  "Ladon: Greek Treasure Guardian"
    → "Ladon the Hundred-Headed Serpent Guarded the Golden Apples of the Hesperides"
  "Narwhal Tusks as Unicorn Horns"
    → "Medieval Merchants Sold Narwhal Tusks to Royalty as Genuine Unicorn Horns"
  "Zeus's Unique Birth of Athena"
    → "Athena Burst Fully Armored From Zeus's Skull After He Swallowed Her Mother"
  "Scarab Beetles: Symbol of Rebirth"
    → "Ancient Egyptians Believed Scarab Beetles Rolled the Sun Across the Sky Each Morning"

Return a JSON object with exactly one field:
{ "headline": "the rewritten headline" }`;
}
