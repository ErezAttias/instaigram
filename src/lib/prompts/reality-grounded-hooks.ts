import type { TopicEvent } from '@/lib/external/topic-events';

/**
 * Build a reality-grounded hooks prompt with optional external context.
 *
 * When externalEvents are provided, the model is instructed to generate hooks
 * ONLY from those events (external-context mode).
 * When absent, falls back to internal-knowledge mode.
 */
export function buildRealityGroundedHooksPrompt(
  topic: string,
  requestedCount: number = 15,
  externalEvents?: TopicEvent[],
): string {
  const hasExternalContext = externalEvents && externalEvents.length > 0;

  const externalContextBlock = hasExternalContext
    ? `
EXTERNAL CONTEXT (use ONLY these events as source material):
${externalEvents.map((e, i) => `[${i + 1}] "${e.headline}"
    Source: ${e.source} | Date: ${e.timestamp}
    Summary: ${e.summary}
    Entities: ${e.entities.length > 0 ? e.entities.join(', ') : 'extract from headline'}`).join('\n\n')}

CRITICAL: Generate hooks ONLY from the events listed above. Do NOT use your internal knowledge to invent additional events.
Each hook must clearly trace back to one of the numbered events above.
`
    : `
SOURCE MODE: Internal knowledge
You may use your training data to identify recent real-world events related to the topic.
Prefer widely known, verifiable events.
`;

  return `You are a reality-grounded content generator.
Your task is to generate high-quality social media hooks based on real, recent events related to the given topic.

TOPIC: ${topic}
REQUESTED COUNT: Generate up to ${requestedCount} hooks. Return fewer if you cannot maintain quality.
${externalContextBlock}
REQUIREMENTS:
- Each hook must reference at least one real entity (person, company, team, place, product, organization, etc.).
- Do not invent facts, names, or events.
- Do not write generic hooks that could apply to any topic.
- Each hook must feel like a reaction to something that actually happened.
- Max 12 words per hook.
- Avoid clichés and vague language.
- If fewer than ${requestedCount} strong hooks exist, return fewer hooks instead of lowering quality.

INTERNAL SELF-CHECK:
Reject any hook that:
- does not include a real entity
- is not clearly tied to a specific event
- could apply to an unrelated topic
- contains fabricated or weakly grounded claims

EXACT JSON SCHEMA (follow precisely):
{
  "hooks": [
    {
      "text": "string (the hook text, max 12 words)",
      "entity_refs": ["string (real entities referenced)"],
      "event_summary": "string (brief summary of the real event this hook references)",
      "angle": "insight" | "controversy" | "irony" | "data"
    }
  ]
}

Return JSON only. No markdown fences, no commentary.`;
}
