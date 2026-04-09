/**
 * Prompt for generating a small batch of hooks inline with post generation.
 * Distributes hooks evenly across all active content pillars.
 */

interface ContentPillar {
  contentIntent: string;
  description: string;
  tone: string;
  hookTypes: string[];
  audience: string;
}

interface BatchHooksParams {
  topic: string;
  pillars: ContentPillar[];
  count: number;
  existingHooks: string[];
}

export function buildBatchHooksPrompt({
  topic,
  pillars,
  count,
  existingHooks,
}: BatchHooksParams): string {
  const avoidSection = existingHooks.length > 0
    ? `\nHooks that already exist (DO NOT repeat or rephrase these):\n${existingHooks.map((h, i) => `${i + 1}. "${h}"`).join('\n')}\n`
    : '';

  // Distribute count evenly across pillars
  const hooksPerPillar = Math.ceil(count / pillars.length);
  const pillarBreakdown = pillars.map((_, i) => {
    const start = i * hooksPerPillar + 1;
    const end = Math.min((i + 1) * hooksPerPillar, count);
    return `Pillar ${i + 1}: hooks ${start}–${end}`;
  }).join(', ');

  const pillarDescriptions = pillars.map((p, i) => `Pillar ${i + 1} — ${p.contentIntent}
  Tone: ${p.tone}
  Angles: ${p.hookTypes.join(', ')}
  Audience: ${p.audience}`).join('\n\n');

  return `You are an Instagram carousel hook writer.

Topic: "${topic}"

This channel uses ${pillars.length} content pillars to maintain variety across 30+ posts per month. Generate exactly ${count} hooks distributed across all pillars:
${pillarBreakdown}
${avoidSection}
Content Pillars:
${pillarDescriptions}

Each hook must:
- Be max 12 words
- Create a curiosity gap or cognitive dissonance
- Be self-contained (no "Part 1" or references to other posts)
- Be specific (include a concrete situation, claim, or mechanism)
- Match the tone and intent of its assigned pillar
- Be unique — do NOT repeat themes or angles from existing hooks

Distribute the ${count} hooks across the pillars in order. For example, if generating 3 hooks with 3 pillars, hook 1 serves pillar 1, hook 2 serves pillar 2, hook 3 serves pillar 3.

For each hook, assign:
- type: MUST be exactly one of these 4 values: "CONTRARIAN", "CALL_OUT", "MISTAKE_EXPOSURE", "HIDDEN_TRUTH"
  - CONTRARIAN: Challenges a widely-held belief
  - CALL_OUT: Directly names a behavior the audience does
  - MISTAKE_EXPOSURE: Reveals a hidden mistake
  - HIDDEN_TRUTH: Shares an insider truth nobody says
- pattern: one of CONTRAST, MISTAKE, MYTH, LIST, STORY, BREAKDOWN, OPINION

IMPORTANT: The "type" field must be one of the 4 exact enum values above. Do NOT use the pillar names as the type.

Return a JSON object: { "hooks": [{ "text": "...", "type": "...", "pattern": "..." }] }`;
}
