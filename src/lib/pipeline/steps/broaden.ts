import type { AIProvider } from '@/lib/ai/types';
import { z } from 'zod';

const BroadenedConcept = z.object({
  broadenedConcept: z.string().min(2).max(120),
  rationale: z.string(),
});

/**
 * Broaden a concept that produced too few facts.
 *
 * Takes a narrow concept (e.g. "Male Seahorse Pregnancy") and returns a
 * slightly wider one (e.g. "Unusual Reproductive Behaviors in Animals")
 * while staying aligned with the original hook and topic.
 *
 * Single LLM call.
 */
export async function broadenConcept(
  params: {
    originalConcept: string;
    topic: string;
    hook: { text: string; type: string };
  },
  ai: AIProvider,
): Promise<string> {
  const prompt = `You are adjusting the scope of a content concept that was too narrow to produce enough facts.

TOPIC: "${params.topic}"
HOOK: "${params.hook.text}" (${params.hook.type})
ORIGINAL CONCEPT: "${params.originalConcept}"

The original concept produced fewer than 3 usable facts after mining and filtering.

Your job: broaden this concept slightly so more diverse facts can be mined, while staying relevant to the hook.

RULES:
- The broadened concept MUST still be relevant to the original hook
- It must increase fact diversity (more angles, more entities, more sub-topics)
- It must NOT become generic (e.g. "Animal facts", "Interesting things", "History")
- It should feel like a natural widening of the original lens

EXAMPLES:
- "Male Seahorse Pregnancy" → "Unusual Reproductive Behaviors in Animals"
- "Tardigrade Survival" → "Animals That Survive Extreme Conditions"
- "The Sorting Hat" → "Sentient Magical Objects in Harry Potter"
- "Bitcoin Mining Energy Use" → "The Hidden Environmental Costs of Digital Technology"

BAD broadenings (too generic):
- "Male Seahorse Pregnancy" → "Animal Facts"
- "The Sorting Hat" → "Harry Potter"

Return:
{
  "broadenedConcept": "the broadened concept string",
  "rationale": "one sentence explaining how this widens the scope while staying relevant"
}`;

  const { data } = await ai.generateObject(prompt, BroadenedConcept);

  console.log(
    `[broaden] "${params.originalConcept}" → "${data.broadenedConcept}" — ${data.rationale}`
  );

  return data.broadenedConcept;
}
