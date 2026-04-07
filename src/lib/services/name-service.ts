import { prisma } from '@/lib/db/prisma';
import { getAIProvider } from '@/lib/ai/provider';
import { buildNameGenerationPrompt } from '@/lib/prompts/name-generation';
import { GeneratedChannelNames } from '@/lib/validation/schemas';
import { inferContentStyle } from '@/lib/utils/content-style-inferrer';

export async function generateChannelNames(
  channelId: string,
  style?: 'descriptive' | 'bold' | 'minimal' | 'personal'
) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {},
  });

  if (!channel) {
    throw new Error('Channel not found');
  }

  if (!channel.niche) {
    throw new Error('No niche selected for this channel');
  }

  const positioning = inferContentStyle(channel.niche || channel.name);

  const prompt = buildNameGenerationPrompt({
    niche: channel.niche,
    positioning: {
      angle: positioning.angle,
      tone: positioning.tone,
      contentStyle: positioning.contentStyle,
      audienceFeel: positioning.audienceFeel,
    },
    style,
  });

  const ai = getAIProvider();
  const { data: generated } = await ai.generateObject(prompt, GeneratedChannelNames);

  return generated.names;
}

export async function setChannelName(channelId: string, name: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel) {
    throw new Error('Channel not found');
  }

  const updated = await prisma.channel.update({
    where: { id: channelId },
    data: {
      name,
      status: 'NAMED',
    },
    include: {
      memory: true,
      nicheOptions: true,
      posts: true,
    },
  });

  return updated;
}
