import type { AIProvider } from '@/lib/ai/types';
import { MinedFactPool } from '@/lib/validation/schemas';
import type { MinedFact, CarouselMode } from '@/lib/validation/schemas';
import { buildMinePrompt } from '@/lib/pipeline/prompts/mine-prompt';
import type { TopicDomainStyle } from '@/lib/utils/topic-classifier';

interface KnowledgeFactInput {
  id: string;
  text: string;
  entities: string[];
}

export interface MineParams {
  topic: string;
  hook: {
    text: string;
    type: string;
  };
  knowledgeFacts?: KnowledgeFactInput[];
  pattern?: string;
  candidateCount?: number;
  /** Carousel mode — passed through to mine prompt for mode-specific instructions. */
  mode?: CarouselMode;
  /** The specific entity or theme concept for focused mining. */
  concept?: string;
  /** The specific question/angle this carousel answers — facts must serve this angle. */
  angleDescription?: string;
  /** Domain style — narrative (mythology/history) vs informational (animals/science). */
  domainStyle?: TopicDomainStyle;
}

export interface MineResult {
  candidates: MinedFact[];
  groundedCount: number;
  internalCount: number;
}

/**
 * Step 1: MINE — Generate a pool of candidate facts about the topic.
 *
 * Calls the LLM once to produce 15-20 raw facts. These are not slides yet —
 * they are factual material that later steps will filter, rank, and compose.
 */
export async function mineFacts(
  params: MineParams,
  ai: AIProvider,
): Promise<MineResult> {
  const prompt = buildMinePrompt({
    topic: params.topic,
    hook: params.hook,
    knowledgeFacts: params.knowledgeFacts,
    pattern: params.pattern,
    candidateCount: params.candidateCount ?? 18,
    mode: params.mode,
    concept: params.concept,
    angleDescription: params.angleDescription,
    domainStyle: params.domainStyle,
  });

  const { data: pool } = await ai.generateObject(prompt, MinedFactPool);

  const candidates = pool.candidates;
  const groundedCount = candidates.filter(c => c.source_type === 'grounded').length;
  const internalCount = candidates.filter(c => c.source_type === 'internal_knowledge').length;

  console.log(
    `[mine] Generated ${candidates.length} candidates ` +
    `(${groundedCount} grounded, ${internalCount} internal) ` +
    `for topic "${params.topic}"`
  );

  return {
    candidates,
    groundedCount,
    internalCount,
  };
}
