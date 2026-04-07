import type { AIProvider } from '@/lib/ai/types';
import type { MinedFact, ExpandedFact, CarouselMode } from '@/lib/validation/schemas';
import { ExpandedFactPool } from '@/lib/validation/schemas';
import { buildExpandPrompt } from '../prompts/expand-prompt';

export interface ExpandParams {
  topic: string;
  hook: { text: string; type: string };
  selectedFacts: MinedFact[];
  mode: CarouselMode;
  concept: string;
}

export interface ExpandResult {
  expandedFacts: ExpandedFact[];
}

/**
 * Step 3.5: EXPAND — Enrich each selected fact with a detailed, insightful explanation.
 *
 * Takes the short claim+evidence from the MINE/SELECT steps and produces a 2–3 sentence
 * expansion per fact that explains mechanism, adds context, and includes surprising details.
 *
 * This is an LLM call. The expanded facts are then passed to COMPOSE, which uses
 * the expansion (not the raw claim) as the slide body source material.
 */
export async function expandFacts(
  params: ExpandParams,
  ai: AIProvider,
): Promise<ExpandResult> {
  const { topic, hook, selectedFacts, mode, concept } = params;

  const prompt = buildExpandPrompt({ topic, hook, selectedFacts, mode, concept });

  const { data } = await ai.generateObject(prompt, ExpandedFactPool);

  // Safety: ensure we got the right count and order
  if (data.facts.length !== selectedFacts.length) {
    console.warn(
      `[expand] Expected ${selectedFacts.length} expanded facts, got ${data.facts.length}. ` +
      `Falling back to original facts with empty expansions.`,
    );

    // Fallback: use evidence as expansion so the pipeline doesn't break
    return {
      expandedFacts: selectedFacts.map(f => ({
        ...f,
        expansion: f.evidence,
      })),
    };
  }

  // Verify original fields weren't mutated — trust the LLM for expansion but
  // force-restore original structural fields for integrity
  const expandedFacts: ExpandedFact[] = data.facts.map((expanded, i) => ({
    ...selectedFacts[i],
    expansion: expanded.expansion,
  }));

  return { expandedFacts };
}
