import { prisma } from '@/lib/db/prisma';
import type { CarouselJobStatus } from '@/generated/prisma/enums';
import { DEFAULT_VISUAL_STYLE, type ChannelVisualStyleContext } from '@/lib/visual/visual-style';

// ─── Channel Queries ────────────────────────────────────────

export async function getChannelsWithStats() {
  const channels = await prisma.channel.findMany({
    include: {
      positioning: true,
      memory: true,
      _count: { select: { carouselJobs: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // For each channel, get the latest carousel date
  const channelIds = channels.map(c => c.id);
  let latestMap = new Map<string, Date | null>();

  if (channelIds.length > 0) {
    const latestCarousels = await prisma.carouselJob.groupBy({
      by: ['channelId'],
      where: { channelId: { in: channelIds } },
      _max: { createdAt: true },
    });

    latestMap = new Map(
      latestCarousels
        .filter(lc => lc.channelId !== null)
        .map(lc => [lc.channelId!, lc._max.createdAt])
    );
  }

  return channels.map(channel => ({
    id: channel.id,
    name: channel.name,
    niche: channel.niche,
    language: channel.language,
    status: channel.status,
    carouselCount: channel._count.carouselJobs,
    lastCarouselAt: latestMap.get(channel.id) || null,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
  }));
}

export async function getChannelDetail(channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      positioning: true,
      memory: true,
    },
  });

  if (!channel) throw new Error('Channel not found');

  // Don't expose the raw access token to the frontend
  const { instagramAccessToken: _token, ...safeChannel } = channel;
  return {
    ...safeChannel,
    instagramConnected: !!channel.instagramAccessToken,
  };
}

export async function createQuickChannel(input: {
  name: string;
  niche: string;
  language?: string;
}) {
  return prisma.channel.create({
    data: {
      name: input.name,
      niche: input.niche,
      language: input.language || 'en',
      nicheMode: 'DIRECT',
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
    include: { memory: true },
  });
}

export async function updateChannelProfile(
  channelId: string,
  data: { name?: string; niche?: string; language?: string }
) {
  return prisma.channel.update({
    where: { id: channelId },
    data,
  });
}

// ─── Channel Visual Style ───────────────────────────────────

function toStyleContext(record: {
  titleFontId: string;
  bodyFontId: string;
  singleFont: boolean;
  headlineColor: string | null;
  emphasisColor: string | null;
  bodyColor: string | null;
  textBgEnabled: boolean;
  textBgColor: string | null;
  logoBase64: string | null;
  logoPosition: string;
  logoSizePx: number;
  t1FontSizePx: number;
  t2FontSizePx: number;
  t1FontSizePxOpener: number | null;
  t1FontSizePxCta: number | null;
  titleAlign: string;
  titleWeight: number;
  bodyAlign: string;
  bodyWeight: number;
}): ChannelVisualStyleContext {
  return {
    titleFontId: record.titleFontId,
    bodyFontId: record.bodyFontId,
    singleFont: record.singleFont,
    headlineColor: record.headlineColor,
    emphasisColor: record.emphasisColor,
    bodyColor: record.bodyColor,
    textBgEnabled: record.textBgEnabled,
    textBgColor: record.textBgColor,
    logoBase64: record.logoBase64,
    logoPosition: record.logoPosition as ChannelVisualStyleContext['logoPosition'],
    logoSizePx: record.logoSizePx,
    t1FontSizePx: record.t1FontSizePx,
    t2FontSizePx: record.t2FontSizePx,
    t1FontSizePxOpener: record.t1FontSizePxOpener,
    t1FontSizePxCta: record.t1FontSizePxCta,
    titleAlign: record.titleAlign as ChannelVisualStyleContext['titleAlign'],
    titleWeight: record.titleWeight,
    bodyAlign: record.bodyAlign as ChannelVisualStyleContext['bodyAlign'],
    bodyWeight: record.bodyWeight,
  };
}

export async function getChannelVisualStyle(channelId: string): Promise<ChannelVisualStyleContext> {
  const record = await prisma.channelVisualStyle.findUnique({ where: { channelId } });
  if (!record) return { ...DEFAULT_VISUAL_STYLE };
  return toStyleContext(record);
}

export async function upsertChannelVisualStyle(
  channelId: string,
  data: Partial<ChannelVisualStyleContext>,
): Promise<ChannelVisualStyleContext> {
  const record = await prisma.channelVisualStyle.upsert({
    where: { channelId },
    update: data,
    create: { channelId, ...DEFAULT_VISUAL_STYLE, ...data },
  });
  return toStyleContext(record);
}

// ─── Carousel Queries ───────────────────────────────────────

export async function getChannelCarousels(
  channelId: string,
  filters?: { status?: CarouselJobStatus }
) {
  const where: Record<string, unknown> = { channelId };

  if (filters?.status) {
    where.status = filters.status;
  }

  const carousels = await prisma.carouselJob.findMany({
    where,
    select: {
      id: true,
      topic: true,
      direction: true,
      status: true,
      approved: true,
      caption: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return carousels.map(c => ({
    ...c,
    thumbnailUrl: null,
  }));
}

/**
 * Dashboard query — every carousel across every channel. Flattens the old
 * "channels first" view so a single test carousel doesn't create a "channel"
 * row the user has to scroll past. Returns a thumbnail URL by pulling the
 * first rendered slide's image.
 */
export async function getAllCarousels(limit = 200) {
  const carousels = await prisma.carouselJob.findMany({
    select: {
      id: true,
      topic: true,
      direction: true,
      status: true,
      approved: true,
      createdAt: true,
      updatedAt: true,
      channelId: true,
      channel: { select: { id: true, name: true } },
      slides: {
        where: { imageUrl: { not: null } },
        orderBy: { slideIndex: 'asc' },
        take: 1,
        select: { imageUrl: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  return carousels.map(c => ({
    id: c.id,
    topic: c.topic,
    direction: c.direction,
    status: c.status,
    approved: c.approved,
    thumbnailUrl: c.slides[0]?.imageUrl ?? null,
    channelId: c.channelId,
    channelName: c.channel?.name ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));
}

export async function deleteCarousel(jobId: string) {
  return prisma.carouselJob.delete({
    where: { id: jobId },
  });
}

export async function deleteChannel(channelId: string) {
  return prisma.$transaction(async (tx) => {
    // Get post IDs so we can delete their children
    const posts = await tx.post.findMany({ where: { channelId }, select: { id: true } });
    const postIds = posts.map(p => p.id);

    if (postIds.length > 0) {
      await tx.slide.deleteMany({ where: { postId: { in: postIds } } });
      await tx.caption.deleteMany({ where: { postId: { in: postIds } } });
    }
    await tx.post.deleteMany({ where: { channelId } });

    // Delete carousels linked to this channel directly or via its batch orders
    await tx.carouselJob.deleteMany({
      where: { OR: [{ channelId }, { batchOrder: { channelId } }] },
    });
    await tx.batchOrder.deleteMany({ where: { channelId } });
    await tx.generationJob.deleteMany({ where: { channelId } });
    await tx.nicheOption.deleteMany({ where: { channelId } });
    await tx.channelPositioning.deleteMany({ where: { channelId } });
    await tx.channelMemory.deleteMany({ where: { channelId } });

    // ChannelVisualStyle cascades automatically
    return tx.channel.delete({ where: { id: channelId } });
  });
}
