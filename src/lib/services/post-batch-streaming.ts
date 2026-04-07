/**
 * Batch post generation — generates N full posts (hook + carousel + caption) at a time.
 * Used in the content-first flow where hooks are generated inline with posts.
 */

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { SlideRole } from '@/generated/prisma/enums';
import { getAIProvider } from '@/lib/ai/provider';
import { buildCaptionGenerationPrompt } from '@/lib/prompts/caption-generation';
import { GeneratedCaption } from '@/lib/validation/schemas';
import { fetchTopicKnowledge } from '@/lib/external/topic-knowledge';
import { generateCarousel } from '@/lib/pipeline/carousel-pipeline';
import { buildBatchHooksPrompt } from '@/lib/prompts/batch-hooks';

/** Lenient schema that accepts any string for type/pattern, so we can normalize after parsing */
const LenientGeneratedHooks = z.object({
  hooks: z.array(z.object({
    text: z.string(),
    type: z.string(),
    pattern: z.string().optional(),
  })),
});

import type { PostStreamEvent } from '@/lib/services/post-service-streaming';
export type { PostStreamEvent } from '@/lib/services/post-service-streaming';

// ─── Types ──────────────────────────────────────────────────────

interface ContentStrategy {
  contentIntent: string;
  description: string;
  tone: string;
  hookTypes: string[];
  audience: string;
}

type HookType = 'CONTRARIAN' | 'CALL_OUT' | 'MISTAKE_EXPOSURE' | 'HIDDEN_TRUTH';
type HookPattern = 'CONTRAST' | 'MISTAKE' | 'MYTH' | 'LIST' | 'STORY' | 'BREAKDOWN' | 'OPINION';

const VALID_HOOK_TYPES = new Set<string>(['CONTRARIAN', 'CALL_OUT', 'MISTAKE_EXPOSURE', 'HIDDEN_TRUTH']);

/** Map free-form hook type strings to the required enum value */
function normalizeHookType(raw: string): HookType {
  const upper = raw.toUpperCase().replace(/[\s-]+/g, '_');
  if (VALID_HOOK_TYPES.has(upper)) return upper as HookType;
  // Fuzzy mapping for common AI responses
  const lower = raw.toLowerCase();
  if (lower.includes('contrarian') || lower.includes('myth') || lower.includes('challenge')) return 'CONTRARIAN';
  if (lower.includes('call') || lower.includes('behavior') || lower.includes('irony')) return 'CALL_OUT';
  if (lower.includes('mistake') || lower.includes('exposure') || lower.includes('error')) return 'MISTAKE_EXPOSURE';
  return 'HIDDEN_TRUTH'; // default fallback
}

interface GeneratedBatchHook {
  text: string;
  type: HookType;
  pattern: HookPattern;
}

// ─── Streaming entry point ──────────────────────────────────────

export async function* generatePostsBatchStreaming(
  channelId: string,
  batchSize: number = 3
): AsyncGenerator<PostStreamEvent> {
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

  const contentStrategy = channel.contentStrategy as ContentStrategy | null;
  if (!contentStrategy) {
    yield { event: 'error', data: { error: 'No content strategy defined. Approve a strategy first.' } };
    return;
  }

  const ai = getAIProvider();
  const topic = channel.niche || channel.exploreTopic || 'general';

  // Determine the next dayIndex offset (how many posts already exist)
  const existingPostCount = channel.posts.length;
  const startIndex = existingPostCount;

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

  yield {
    event: 'phase',
    data: { phase: 'setup', message: `Generating batch of ${batchSize} posts (starting at #${startIndex})...` },
  };

  // Fetch knowledge once for all posts in this batch
  const knowledge = await fetchTopicKnowledge(topic, 15).catch((err: unknown) => {
    console.warn(`[post-batch] Knowledge fetch failed: ${err instanceof Error ? err.message : 'unknown'}`);
    return undefined;
  });
  const knowledgeFacts = knowledge?.facts;

  // Step 1: Generate hooks for this batch
  yield {
    event: 'phase',
    data: { phase: 'generating_hooks', message: `Creating ${batchSize} hooks...` },
  };

  const existingHooks = channel.posts.map(p => p.hook);
  let batchHooks: GeneratedBatchHook[];

  try {
    const hookPrompt = buildBatchHooksPrompt({
      topic,
      contentStrategy,
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

  // Step 2: For each hook, create post record then generate full carousel
  let passCount = 0;
  let failCount = 0;
  const usedConcepts: string[] = channel.posts.map(p => p.title); // avoid duplicating existing concepts

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
      // Create the post record (use hook text as initial title until carousel generates a real one)
      const post = await prisma.post.create({
        data: {
          channelId,
          dayIndex,
          title: hook.text,
          hook: hook.text,
          type: hook.type,
          pattern: hook.pattern,
          status: 'DRAFT',
        },
      });

      // Run carousel pipeline
      const result = await generateCarousel(
        {
          topic,
          hook: { text: hook.text, type: hook.type },
          knowledgeFacts,
          memory: memoryParams,
          pattern: hook.pattern,
          usedConcepts,
        },
        ai,
      );

      const { carousel, validation, concept, compressedSlides } = result;
      usedConcepts.push(concept);

      if (validation.passed) passCount++;
      else failCount++;

      // Create slides
      await Promise.all(
        carousel.slides.map(slide => {
          const compressed = compressedSlides.find(c => c.slideNumber === slide.slideNumber);
          return prisma.slide.create({
            data: {
              postId: post.id,
              slideIndex: slide.slideNumber,
              role: slide.role as SlideRole,
              text: slide.body ? `${slide.headline} — ${slide.body}` : slide.headline,
              headline: slide.headline,
              body: slide.body,
              supportingDetail: slide.supportingDetail,
              factType: slide.factType,
              containsNumber: slide.containsNumber,
              concretenessScore: slide.concretenessScore,
              noveltyScore: slide.noveltyScore,
              topicEntity: slide.topicEntity,
              qualityPassed: !validation.slidesToRegenerate.includes(slide.slideNumber),
              displayTitle: compressed?.displayTitle ?? null,
              displaySupport: compressed?.displaySupport ?? null,
            },
          });
        })
      );

      // Generate caption
      const captionPrompt = buildCaptionGenerationPrompt({
        channelName: channel.name,
        post: {
          title: carousel.title,
          hook: hook.text,
          type: hook.type,
        },
        slides: carousel.slides.map(s => ({
          role: s.role,
          headline: s.headline,
          body: s.body,
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

      // Update post title
      await prisma.post.update({
        where: { id: post.id },
        data: { title: carousel.title, status: 'GENERATED' },
      });

      yield {
        event: 'post_complete',
        data: {
          postIndex: i + 1,
          totalPosts: batchSize,
          post: {
            id: post.id,
            dayIndex,
            title: carousel.title,
            hook: hook.text,
            type: hook.type,
            status: 'GENERATED',
            slideCount: carousel.slides.length,
            slides: carousel.slides.map(s => ({
              slideIndex: s.slideNumber,
              role: s.role,
              headline: s.headline,
              body: s.body,
              supportingDetail: s.supportingDetail,
            })),
          },
        },
      };
    } catch (err) {
      failCount++;
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[post-batch] Post ${i + 1}/${batchSize} failed:`, message);

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
        streamed: true,
        batchMode: true,
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
