import { prisma } from '@/lib/db/prisma';
import { getAIProvider } from '@/lib/ai/provider';
import { buildContentStrategyPrompt } from '@/lib/prompts/content-strategy';
import { GeneratedContentStrategyOptions as StrategyOptionsSchema } from '@/lib/validation/schemas';
import type { GeneratedContentStrategy as ContentStrategyType } from '@/lib/validation/schemas';

/**
 * Generate 3 complementary content pillars for a channel based on its topic/niche.
 * Returns the pillars plus a shared channelTone and channelAudience.
 */
export async function generateContentStrategyOptions(topic: string): Promise<{
  strategies: ContentStrategyType[];
  channelTone: string;
  channelAudience: string;
}> {
  const ai = getAIProvider();
  const prompt = buildContentStrategyPrompt(topic);
  const { data } = await ai.generateObject(prompt, StrategyOptionsSchema);
  return {
    strategies: data.strategies,
    channelTone: data.channelTone,
    channelAudience: data.channelAudience,
  };
}

/**
 * Approve and store content pillars on the channel.
 * Accepts an array of selected pillars plus optional shared channel identity.
 * Transitions channel status to STRATEGY_DEFINED.
 */
export async function approveContentStrategy(
  channelId: string,
  pillars: ContentStrategyType[],
  channelTone?: string,
  channelAudience?: string,
) {
  // Derive shared channel identity from pillars if not provided
  const resolvedTone = channelTone || pillars.map(p => p.tone).join(', ');
  const resolvedAudience = channelAudience || pillars[0]?.audience || '';

  // Merge all hookTypes across pillars for channel memory
  const allHookTypes = Array.from(new Set(pillars.flatMap(p => p.hookTypes)));

  const contentStrategyJson = {
    channelTone: resolvedTone,
    channelAudience: resolvedAudience,
    pillars: pillars,
  };

  const channel = await prisma.channel.update({
    where: { id: channelId },
    data: {
      contentStrategy: JSON.parse(JSON.stringify(contentStrategyJson)),
      // Keep contentIntent as the first pillar's intent for legacy field compatibility
      contentIntent: pillars[0]?.contentIntent || undefined,
      status: 'STRATEGY_DEFINED',
    },
    include: {
      memory: true,
      nicheOptions: true,
      posts: true,
    },
  });

  // Update channel memory tone + aggression to match the channel tone
  if (channel.memory) {
    const toneLower = resolvedTone.toLowerCase();
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
        tone: resolvedTone.split(',')[0].trim().toLowerCase().slice(0, 50),
        aggressionLevel,
        preferredHooks: allHookTypes,
      },
    });
  }

  return channel;
}
