import type { AIProvider } from '@/lib/ai/types';
import { SelectedConcept } from '@/lib/validation/schemas';
import type { SelectedConcept as SelectedConceptType } from '@/lib/validation/schemas';
import { buildConceptPrompt } from '@/lib/pipeline/prompts/concept-prompt';

export interface ConceptParams {
  topic: string;
  hook: {
    text: string;
    type: string;
  };
  usedConcepts?: string[];
  direction?: string;
  channelNiche?: string;
  channelName?: string;
}

/**
 * Step 0: CONCEPT — Decide carousel mode and pick a specific entity or theme.
 *
 * This step narrows a broad topic into a focused concept before fact mining begins.
 * In single_entity mode, the concept is a specific named thing (e.g., "The Sorting Hat").
 * In thematic_collection mode, the concept is a specific lens (e.g., "Foods that are radioactive").
 */
export async function selectConcept(
  params: ConceptParams,
  ai: AIProvider,
): Promise<SelectedConceptType> {
  const prompt = buildConceptPrompt({
    topic: params.topic,
    hook: params.hook,
    usedConcepts: params.usedConcepts,
    direction: params.direction,
    channelNiche: params.channelNiche,
    channelName: params.channelName,
  });

  const { data: selected } = await ai.generateObject(prompt, SelectedConcept);

  console.log(
    `[concept] Mode: ${selected.mode}, Angle: ${selected.angle || 'unset'}, Concept: "${selected.concept}" ` +
    `(${selected.conceptType}) — ${selected.rationale}`
  );
  if (selected.angleDescription) {
    console.log(`[concept] Angle: "${selected.angleDescription}"`);
  }
  if (selected.suggestedHook) {
    console.log(`[concept] Suggested hook revision: "${selected.suggestedHook}"`);
  }

  return selected;
}
