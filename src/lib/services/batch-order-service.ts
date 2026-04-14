/**
 * Batch Order Service
 *
 * Orchestrates batch carousel generation for a channel.
 * Creates a BatchOrder record, generates topics (or uses user-provided ones),
 * then runs each carousel sequentially through the full pipeline.
 *
 * The batch itself is fire-and-forget at the API level — progress is
 * tracked in the BatchOrder record and polled via SSE.
 */

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { getAIProvider } from '@/lib/ai/provider';
import { buildBatchHooksPrompt } from '@/lib/prompts/batch-hooks';
import { createCarouselJob, runCarouselGeneration } from '@/lib/services/standalone-carousel-service';

// ─── Types ──────────────────────────────────────────────────────

interface ContentStrategy {
  contentIntent: string;
  description: string;
  tone: string;
  hookTypes: string[];
  audience: string;
}

function extractPillars(raw: unknown): ContentStrategy[] {
  if (!raw || typeof raw !== 'object') return [];
  const data = raw as Record<string, unknown>;
  if (Array.isArray(data.pillars)) return data.pillars as ContentStrategy[];
  if (typeof data.contentIntent === 'string') return [data as unknown as ContentStrategy];
  return [];
}

const LenientGeneratedHooks = z.object({
  hooks: z.array(z.object({
    text: z.string(),
    type: z.string(),
    pattern: z.string().optional(),
  })),
});

// ─── Create Batch Order ─────────────────────────────────────────

export async function createBatchOrder(
  channelId: string,
  size: number,
  topics?: string[],
  direction?: string,
) {
  return prisma.batchOrder.create({
    data: {
      channelId,
      size,
      topics: topics && topics.length > 0 ? topics : undefined,
      direction: direction || null,
      status: 'PENDING',
    },
  });
}

// ─── Run Batch Order (background) ───────────────────────────────

export async function runBatchOrder(batchOrderId: string): Promise<void> {
  const batchOrder = await prisma.batchOrder.findUnique({
    where: { id: batchOrderId },
    include: {
      channel: {
        include: { memory: true, carouselJobs: { select: { topic: true } } },
      },
    },
  });

  if (!batchOrder) throw new Error('BatchOrder not found');

  const { channel } = batchOrder;
  const pillars = extractPillars(channel.contentStrategy);

  // Mark as started
  await prisma.batchOrder.update({
    where: { id: batchOrderId },
    data: { startedAt: new Date() },
  });

  // ── Resolve topics ──────────────────────────────────────────

  let topics: string[];
  const userTopics = batchOrder.topics as string[] | null;

  if (userTopics && userTopics.length > 0) {
    // User provided specific topics
    topics = userTopics.slice(0, batchOrder.size);
  } else {
    // AI generates topics via hook generation
    await prisma.batchOrder.update({
      where: { id: batchOrderId },
      data: {
        status: 'GENERATING_HOOKS',
        progress: { currentIndex: 0, currentJobId: null, message: 'Generating topics...' },
      },
    });

    try {
      const ai = getAIProvider();
      const niche = channel.niche || channel.exploreTopic || 'general';
      const existingTopics = channel.carouselJobs.map(j => j.topic);

      const effectivePillars = pillars.length > 0 ? pillars : [{
        contentIntent: 'evergreen_fact',
        description: `Fascinating facts about ${niche}`,
        tone: 'sharp',
        hookTypes: ['contrarian', 'hidden truth', 'call out', 'mistake exposure'],
        audience: 'curious minds',
      }];

      const hookPrompt = buildBatchHooksPrompt({
        topic: niche,
        pillars: effectivePillars,
        count: batchOrder.size,
        existingHooks: existingTopics,
      });

      const { data } = await ai.generateObject(hookPrompt, LenientGeneratedHooks);
      topics = data.hooks.slice(0, batchOrder.size).map(h => h.text);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await prisma.batchOrder.update({
        where: { id: batchOrderId },
        data: { status: 'FAILED', errorMessage: `Topic generation failed: ${message}`, completedAt: new Date() },
      });
      return;
    }
  }

  // Pad topics if we got fewer than requested
  while (topics.length < batchOrder.size) {
    topics.push(topics[topics.length - 1] || 'General facts');
  }

  // ── Run carousels sequentially ────────────────────────────────

  await prisma.batchOrder.update({
    where: { id: batchOrderId },
    data: { status: 'RUNNING' },
  });

  let completed = 0;
  let failed = 0;

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];

    await prisma.batchOrder.update({
      where: { id: batchOrderId },
      data: {
        progress: {
          currentIndex: i + 1,
          currentJobId: null,
          message: `Generating carousel ${i + 1} of ${topics.length}: "${topic}"`,
        },
      },
    });

    try {
      const job = await createCarouselJob(topic, batchOrder.direction || undefined, channel.id, batchOrderId, undefined, (channel.carouselLayout as 'DETAILED' | 'BOLD') ?? 'DETAILED');

      // Update progress with the job ID so frontend can link to it
      await prisma.batchOrder.update({
        where: { id: batchOrderId },
        data: {
          progress: {
            currentIndex: i + 1,
            currentJobId: job.id,
            message: `Generating carousel ${i + 1} of ${topics.length}: "${topic}"`,
          },
        },
      });

      await runCarouselGeneration(job.id);

      // Check if the job actually succeeded
      const finishedJob = await prisma.carouselJob.findUnique({
        where: { id: job.id },
        select: { status: true },
      });

      if (finishedJob?.status === 'FAILED') {
        failed++;
      } else {
        completed++;
      }
    } catch (err) {
      failed++;
      console.error(`[batch-order] Carousel ${i + 1}/${topics.length} failed:`, err instanceof Error ? err.message : err);
    }

    // Persist aggregate counts after each carousel
    await prisma.batchOrder.update({
      where: { id: batchOrderId },
      data: { completed, failed },
    });
  }

  // ── Finalize ──────────────────────────────────────────────────

  await prisma.batchOrder.update({
    where: { id: batchOrderId },
    data: {
      status: completed === 0 ? 'FAILED' : 'COMPLETE',
      errorMessage: failed > 0 ? `${failed} of ${topics.length} carousels failed` : null,
      completedAt: new Date(),
      progress: {
        currentIndex: topics.length,
        currentJobId: null,
        message: completed === 0 ? 'All carousels failed' : `Done — ${completed} complete, ${failed} failed`,
      },
    },
  });
}

// ─── Query Helpers ──────────────────────────────────────────────

export async function getChannelBatchOrders(channelId: string) {
  return prisma.batchOrder.findMany({
    where: { channelId },
    include: {
      _count: { select: { carouselJobs: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getBatchOrderDetail(batchOrderId: string) {
  return prisma.batchOrder.findUnique({
    where: { id: batchOrderId },
    include: {
      carouselJobs: {
        include: {
          slides: {
            take: 1,
            orderBy: { slideIndex: 'asc' },
            select: { imageUrl: true, role: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}
