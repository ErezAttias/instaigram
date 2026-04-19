import { prisma } from '@/lib/db/prisma';
import type { PrismaClient } from '@/generated/prisma/client';

type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export async function createChannel(input: {
  nicheMode?: 'DISCOVER' | 'EXPLORE' | 'DIRECT';
  exploreTopic?: string;
  directTopic?: string;
}) {
  const { nicheMode = 'DISCOVER' } = input;

  // For direct mode, the topic goes into exploreTopic field
  const topicValue = input.directTopic || input.exploreTopic || null;

  // Auto-name the channel from the topic so the dashboard doesn't fill up
  // with "Untitled Channel" rows. Users can still rename later.
  const autoName = topicValue?.trim() ? topicValue.trim().slice(0, 60) : undefined;

  const channel = await prisma.$transaction(async (tx: TransactionClient) => {
    const created = await tx.channel.create({
      data: {
        nicheMode,
        exploreTopic: topicValue,
        ...(autoName ? { name: autoName } : {}),
        status: 'DRAFT',
        memory: {
          create: {
            tone: 'sharp',
            aggressionLevel: 0.2,
            style: 'minimal',
            avoidPatterns: ['generic tips', 'long paragraphs', 'fluff'],
            preferredHooks: ['contrarian', 'call-out', 'mistake exposure'],
            forbiddenWords: [],
          },
        },
      },
      include: {
        memory: true,
      },
    });

    return created;
  });

  return channel;
}

export async function getChannel(channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      memory: true,
      nicheOptions: true,
      posts: {
        include: {
          slides: true,
          caption: true,
          carouselJob: { select: { status: true } },
        },
      },
      generationJobs: true,
    },
  });

  if (!channel) {
    throw new Error('Channel not found');
  }

  return {
    ...channel,
    posts: channel.posts.map(post => ({
      ...post,
      carouselJobStatus: post.carouselJob?.status ?? null,
    })),
  };
}
