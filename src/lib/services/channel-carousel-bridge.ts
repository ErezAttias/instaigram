/**
 * Channel–Carousel Bridge
 *
 * Connects the channel system (niche → strategy → hooks) with the
 * standalone carousel service (quality gates → rendering → enforcement).
 *
 * For each post in a batch:
 *   1. Generate a hook (using batch hook prompt + content strategy)
 *   2. Create a CarouselJob
 *   3. Link Post ↔ CarouselJob
 *   4. Run the full carousel generation (copy → quality gates → images)
 *   5. Generate caption
 *   6. Stream progress events back to the caller
 */

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { getAIProvider } from '@/lib/ai/provider';
import { buildBatchHooksPrompt } from '@/lib/prompts/batch-hooks';
import { buildCaptionGenerationPrompt } from '@/lib/prompts/caption-generation';
import { GeneratedCaption } from '@/lib/validation/schemas';
import { createCarouselJob, runCarouselGeneration } from '@/lib/services/standalone-carousel-service';

// ─── Types ──────────────────────────────────────────────────────

export interface ChannelPostStreamEvent {
  event: 'phase' | 'post_start' | 'post_carousel_progress' | 'post_complete' | 'post_error' | 'complete' | 'error';
  data: Record<string, unknown>;
}

interface ContentStrategy {
  contentIntent: string;
  description: string;
  tone: string;
  hookTypes: string[];
  audience: string;
}

/** Extract pillars from either old single-strategy or new multi-pillar format */
function extractPillars(raw: unknown): ContentStrategy[] {
  if (!raw || typeof raw !== 'object') return [];
  const data = raw as Record<string, unknown>;
  if (Array.isArray(data.pillars)) {
    return data.pillars as ContentStrategy[];
  }
  // Legacy: single strategy stored directly
  if (typeof data.contentIntent === 'string') {
    return [data as unknown as ContentStrategy];
  }
  return [];
}

type HookType = 'CONTRARIAN' | 'CALL_OUT' | 'MISTAKE_EXPOSURE' | 'HIDDEN_TRUTH';

const VALID_HOOK_TYPES = new Set<string>(['CONTRARIAN', 'CALL_OUT', 'MISTAKE_EXPOSURE', 'HIDDEN_TRUTH']);

/** Lenient schema that accepts any string for type/pattern, so we can normalize after parsing */
const LenientGeneratedHooks = z.object({
  hooks: z.array(z.object({
    text: z.string(),
    type: z.string(),
    pattern: z.string().optional(),
  })),
});

type HookPattern = 'CONTRAST' | 'MISTAKE' | 'MYTH' | 'LIST' | 'STORY' | 'BREAKDOWN' | 'OPINION';

function normalizeHookType(raw: string): HookType {
  const upper = raw.toUpperCase().replace(/[\s-]+/g, '_');
  if (VALID_HOOK_TYPES.has(upper)) return upper as HookType;
  const lower = raw.toLowerCase();
  if (lower.includes('contrarian') || lower.includes('myth') || lower.includes('challenge')) return 'CONTRARIAN';
  if (lower.includes('call') || lower.includes('behavior') || lower.includes('irony')) return 'CALL_OUT';
  if (lower.includes('mistake') || lower.includes('exposure') || lower.includes('error')) return 'MISTAKE_EXPOSURE';
  return 'HIDDEN_TRUTH';
}

interface GeneratedBatchHook {
  text: string;
  type: HookType;
  pattern: HookPattern;
}

// ─── Main Entry Point ───────────────────────────────────────────

export async function* generateChannelPostsBatch(
  channelId: string,
  batchSize: number = 3,
): AsyncGenerator<ChannelPostStreamEvent> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      memory: true,
      posts: { orderBy: { dayIndex: 'asc' } },
    },
  });

  if (!channel) {
    yield { event: 'error', data: { error: 'Channel not found' } };
    return;
  }

  const pillars = extractPillars(channel.contentStrategy);
  if (pillars.length === 0) {
    yield { event: 'error', data: { error: 'No content strategy defined. Approve a strategy first.' } };
    return;
  }

  const ai = getAIProvider();
  const topic = channel.niche || channel.exploreTopic || 'general';
  // Use max dayIndex + 1 to avoid unique constraint violations from failed posts
  const existingPostCount = channel.posts.length;
  const maxDayIndex = channel.posts.reduce((max, p) => Math.max(max, p.dayIndex), -1);
  const startIndex = maxDayIndex + 1;

  yield {
    event: 'phase',
    data: { phase: 'setup', message: `Generating batch of ${batchSize} posts via carousel pipeline (starting at #${startIndex})...` },
  };

  // ── Step 1: Generate hooks for this batch ─────────────────────

  yield {
    event: 'phase',
    data: { phase: 'generating_hooks', message: `Creating ${batchSize} hooks...` },
  };

  const existingHooks = channel.posts.map(p => p.hook);
  let batchHooks: GeneratedBatchHook[];

  try {
    const hookPrompt = buildBatchHooksPrompt({
      topic,
      pillars,
      count: batchSize,
      existingHooks,
    });
    const { data } = await ai.generateObject(hookPrompt, LenientGeneratedHooks);
    batchHooks = data.hooks.slice(0, batchSize).map(h => ({
      text: h.text,
      type: normalizeHookType(h.type),
      pattern: (h.pattern?.toUpperCase() as HookPattern) || 'CONTRAST',
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    yield { event: 'error', data: { error: `Hook generation failed: ${message}` } };
    return;
  }

  // ── Step 2: For each hook, create Post + CarouselJob, run full pipeline ──

  let passCount = 0;
  let failCount = 0;

  for (let i = 0; i < batchHooks.length; i++) {
    const hook = batchHooks[i];
    const dayIndex = startIndex + i;

    yield {
      event: 'post_start',
      data: {
        postIndex: i + 1,
        totalPosts: batchSize,
        hook: hook.text,
      },
    };

    try {
      // Create CarouselJob — the standalone service will handle the full pipeline
      const carouselJob = await createCarouselJob(topic, hook.text, channelId);

      // Create Post record linked to the CarouselJob
      const post = await prisma.post.create({
        data: {
          channelId,
          dayIndex,
          title: hook.text,
          hook: hook.text,
          type: hook.type,
          pattern: hook.pattern,
          status: 'DRAFT',
          carouselJobId: carouselJob.id,
        },
      });

      // Emit carouselJobId so the frontend can poll for granular progress
      yield {
        event: 'post_carousel_progress',
        data: {
          postIndex: i + 1,
          totalPosts: batchSize,
          carouselJobId: carouselJob.id,
          message: 'Running carousel pipeline...',
        },
      };

      // Run the full carousel generation (quality gates → rendering → enforcement)
      // This is the same code path as "Create Carousel" — no shortcuts.
      await runCarouselGeneration(carouselJob.id);

      // Fetch the completed job to get the hook text (may have been rewritten by promise gate)
      const completedJob = await prisma.carouselJob.findUnique({
        where: { id: carouselJob.id },
        include: { slides: { orderBy: { slideIndex: 'asc' } } },
      });

      if (!completedJob || completedJob.status === 'FAILED') {
        failCount++;
        yield {
          event: 'post_error',
          data: {
            postIndex: i + 1,
            totalPosts: batchSize,
            hook: hook.text,
            error: completedJob?.errorMessage || 'Carousel generation failed',
            carouselJobId: carouselJob.id,
          },
        };
        continue;
      }

      // Extract the pipeline hook (may have been rewritten) for the caption
      const pipelineMeta = completedJob.pipelineMeta as Record<string, unknown> | null;
      const finalHook = (pipelineMeta?.hook as string) || hook.text;

      // Generate caption using slide data from the carousel job
      const { memory } = channel;
      const memoryParams = memory
        ? {
            tone: memory.tone,
            aggressionLevel: memory.aggressionLevel,
            style: memory.style,
            avoidPatterns: memory.avoidPatterns as string[],
            forbiddenWords: memory.forbiddenWords as string[],
          }
        : undefined;

      const captionPrompt = buildCaptionGenerationPrompt({
        channelName: channel.name,
        post: {
          title: finalHook,
          hook: finalHook,
          type: hook.type,
        },
        slides: completedJob.slides.map(s => ({
          role: s.role,
          headline: s.headline || '',
          body: s.body || '',
          supportingDetail: s.supportingDetail,
        })),
        memory: memoryParams,
      });

      const { data: generatedCaption } = await ai.generateObject(captionPrompt, GeneratedCaption);

      await prisma.caption.create({
        data: {
          postId: post.id,
          text: generatedCaption.text,
          hashtags: generatedCaption.hashtags,
        },
      });

      // Update post title and status
      const postTitle = completedJob.slides.find(s => s.role === 'OPENER')?.headline || finalHook;
      await prisma.post.update({
        where: { id: post.id },
        data: { title: postTitle, status: 'GENERATED' },
      });

      passCount++;

      yield {
        event: 'post_complete',
        data: {
          postIndex: i + 1,
          totalPosts: batchSize,
          post: {
            id: post.id,
            dayIndex,
            title: postTitle,
            hook: hook.text,
            type: hook.type,
            status: 'GENERATED',
            carouselJobId: carouselJob.id,
            carouselJobStatus: completedJob.status,
            slideCount: completedJob.slides.length,
            hasImages: completedJob.slides.some(s => s.imageUrl !== null),
          },
        },
      };
    } catch (err) {
      failCount++;
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[channel-bridge] Post ${i + 1}/${batchSize} failed:`, message);

      yield {
        event: 'post_error',
        data: {
          postIndex: i + 1,
          totalPosts: batchSize,
          hook: hook.text,
          error: message,
        },
      };
    }
  }

  // Record generation job
  await prisma.generationJob.create({
    data: {
      channelId,
      jobType: 'POST_GENERATION',
      status: 'COMPLETED',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: {
        batchSize,
        startIndex,
        passed: passCount,
        failed: failCount,
        bridge: true,
      } as any,
    },
  });

  // Update channel status if this is the first batch
  if (existingPostCount === 0) {
    await prisma.channel.update({
      where: { id: channelId },
      data: { status: 'CONTENT_GENERATED' },
    });
  }

  yield {
    event: 'complete',
    data: { totalPosts: batchSize, passed: passCount, failed: failCount },
  };
}
