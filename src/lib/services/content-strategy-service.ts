import { prisma } from '@/lib/db/prisma';
import { getAIProvider } from '@/lib/ai/provider';
import { buildContentStrategyPrompt } from '@/lib/prompts/content-strategy';
import { GeneratedContentStrategyOptions as StrategyOptionsSchema } from '@/lib/validation/schemas';
import type { GeneratedContentStrategy as ContentStrategyType } from '@/lib/validation/schemas';

/**
 * Generate 3 content strategy options for a channel based on its topic/niche.
 */
export async function generateContentStrategyOptions(topic: string): Promise<ContentStrategyType[]> {
  const ai = getAIProvider();
  const prompt = buildContentStrategyPrompt(topic);
  const { data } = await ai.generateObject(prompt, StrategyOptionsSchema);
  return data.strategies;
}

/**
 * @deprecated Use generateContentStrategyOptions instead
 */
export async function generateContentDefinition(topic: string): Promise<ContentStrategyType> {
  const options = await generateContentStrategyOptions(topic);
  return options[0];
}

/**
 * Approve and store a content strategy on the channel.
 * Transitions channel status to STRATEGY_DEFINED.
 */
export async function approveContentStrategy(
  channelId: string,
  contentStrategy: ContentStrategyType
) {
  const channel = await prisma.channel.update({
    where: { id: channelId },
    data: {
      contentStrategy: JSON.parse(JSON.stringify(contentStrategy)),
      contentIntent: contentStrategy.contentIntent || undefined,
      status: 'STRATEGY_DEFINED',
    },
    include: {
      memory: true,
      nicheOptions: true,
      posts: true,
    },
  });

  // Update channel memory tone + aggression to match the approved strategy
  if (channel.memory) {
    // Derive aggressionLevel from tone keywords
    const toneLower = contentStrategy.tone.toLowerCase();
    const highAggressionKeywords = ['provocative', 'confrontational', 'aggressive', 'bold', 'challenging'];
    const midAggressionKeywords = ['sharp', 'direct', 'assertive', 'edgy', 'witty'];
    const aggressionLevel = highAggressionKeywords.some(k => toneLower.includes(k))
      ? 0.6
      : midAggressionKeywords.some(k => toneLower.includes(k))
      ? 0.4
      : 0.2;

    await prisma.channelMemory.update({
      where: { id: channel.memory.id },
      data: {
        tone: contentStrategy.tone.split(',')[0].trim().toLowerCase().slice(0, 50),
        aggressionLevel,
        preferredHooks: contentStrategy.hookTypes,
      },
    });
  }

  return channel;
}
