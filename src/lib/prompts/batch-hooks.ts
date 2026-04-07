/**
 * Prompt for generating a small batch of hooks inline with post generation.
 * Used in the content-first flow (batches of 3).
 */

interface BatchHooksParams {
  topic: string;
  contentStrategy: {
    contentIntent: string;
    description: string;
    tone: string;
    hookTypes: string[];
    audience: string;
  };
  count: number;
  existingHooks: string[];
}

export function buildBatchHooksPrompt({
  topic,
  contentStrategy,
  count,
  existingHooks,
}: BatchHooksParams): string {
  const avoidSection = existingHooks.length > 0
    ? `\nHooks that already exist (DO NOT repeat or rephrase these):\n${existingHooks.map((h, i) => `${i + 1}. "${h}"`).join('\n')}\n`
    : '';

  return `You are an Instagram carousel hook writer.

Topic: "${topic}"

Content Strategy:
- Intent: ${contentStrategy.contentIntent}
- Description: ${contentStrategy.description}
- Tone: ${contentStrategy.tone}
- Content themes/angles to draw from: ${contentStrategy.hookTypes.join(', ')}
- Target audience: ${contentStrategy.audience}
${avoidSection}
Generate exactly ${count} hooks. Each hook must:
- Be max 12 words
- Create a curiosity gap or cognitive dissonance
- Be self-contained (no "Part 1" or references to other posts)
- Be specific (include a concrete situation, claim, or mechanism)
- Match the content strategy tone and intent
- Be unique — do NOT repeat themes or angles from existing hooks

For each hook, assign:
- type: MUST be exactly one of these 4 values: "CONTRARIAN", "CALL_OUT", "MISTAKE_EXPOSURE", "HIDDEN_TRUTH"
  - CONTRARIAN: Challenges a widely-held belief
  - CALL_OUT: Directly names a behavior the audience does
  - MISTAKE_EXPOSURE: Reveals a hidden mistake
  - HIDDEN_TRUTH: Shares an insider truth nobody says
- pattern: one of CONTRAST, MISTAKE, MYTH, LIST, STORY, BREAKDOWN, OPINION

IMPORTANT: The "type" field must be one of the 4 exact enum values above. Do NOT use the content theme names as the type.

Return a JSON object: { "hooks": [{ "text": "...", "type": "...", "pattern": "..." }] }`;
}
