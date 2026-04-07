import type { KnowledgeFact } from '@/lib/external/topic-knowledge';

/**
 * Build a knowledge-grounded hooks prompt.
 * The model generates hooks ONLY from the provided verified facts.
 */
export function buildKnowledgeGroundedHooksPrompt(
  topic: string,
  facts: KnowledgeFact[],
  requestedCount: number = 15,
): string {
  const factsBlock = facts
    .map(f => `[${f.id}] ${f.text}${f.entities.length > 0 ? `\n    Entities: ${f.entities.join(', ')}` : ''}`)
    .join('\n\n');

  return `You are a knowledge-grounded content generator.
Your task is to generate high-quality social media hooks based EXCLUSIVELY on the verified facts provided below.

TOPIC: ${topic}
REQUESTED COUNT: Generate up to ${requestedCount} hooks. Return fewer if you cannot maintain quality.

VERIFIED FACTS (use ONLY these as source material):
${factsBlock}

STRICT RULES:
- Generate hooks ONLY from the facts listed above.
- Do NOT add any external knowledge, claims, or context beyond what the facts state.
- Do NOT infer, extrapolate, or speculate beyond the facts.
- Each hook must map to at least one specific fact by its ID (e.g. "fact-1").
- Max 12 words per hook.
- Avoid generic phrasing that could apply to any topic.
- Prefer surprising, counterintuitive, or little-known aspects from the facts.
- If a fact contains a specific number, date, name, or entity — use it.
- If fewer than ${requestedCount} strong hooks can be grounded in the facts, return fewer.

ANGLE GUIDE:
- "insight": reveals something non-obvious from the facts
- "surprising": highlights a counterintuitive or unexpected detail
- "myth-busting": corrects a common misconception using a fact

SELF-CHECK:
Reject any hook that:
- references information NOT present in the provided facts
- could apply to an unrelated topic
- does not clearly trace to a specific fact ID
- uses vague or generic language

EXACT JSON SCHEMA (follow precisely):
{
  "hooks": [
    {
      "text": "string (the hook text, max 12 words)",
      "fact_refs": ["string (fact IDs this hook is based on, e.g. 'fact-1')"],
      "angle": "insight" | "surprising" | "myth-busting"
    }
  ]
}

Return JSON only. No markdown fences, no commentary.`;
}
