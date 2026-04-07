/**
 * Streaming post generation — emits SSE events as each post is completed.
 * Wraps the existing carousel pipeline so the UI can show progress post-by-post.
 */

import { prisma } from '@/lib/db/prisma';
import { SlideRole } from '@/generated/prisma/enums';
import { getAIProvider } from '@/lib/ai/provider';
import { buildCaptionGenerationPrompt } from '@/lib/prompts/caption-generation';
import { GeneratedCaption } from '@/lib/validation/schemas';
import { fetchTopicKnowledge } from '@/lib/external/topic-knowledge';
import { generateCarousel } from '@/lib/pipeline/carousel-pipeline';

// ─── SSE Event Types ─────────────────────────────────────────

export interface PostStreamSlide {
  slideIndex: number;
  role: string;
  headline: string;
  body: string;
  supportingDetail: string | null;
}

export interface PostStreamPost {
  id: string;
  dayIndex: number;
  title: string;
  hook: string;
  type: string;
  status: string;
  slideCount: number;
  slides: PostStreamSlide[];
}

export type PostStreamEvent =
  | { event: 'phase'; data: { phase: string; message: string } }
  | { event: 'post_start'; data: { postIndex: number; totalPosts: number; hook: string } }
  | { event: 'post_complete'; data: { postIndex: number; totalPosts: number; post: PostStreamPost } }
  | { event: 'post_error'; data: { postIndex: number; totalPosts: number; hook: string; error: string } }
  | { event: 'complete'; data: { totalPosts: number; passed: number; failed: number } }
  | { event: 'error'; data: { error: string } };

// ─── Streaming entry point ───────────────────────────────────

export async function* generatePostsStreaming(channelId: string): AsyncGenerator<PostStreamEvent> {
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

  if (!channel.posts || channel.posts.length === 0) {
    yield { event: 'error', data: { error: 'Channel has no hooks. Generate hooks first.' } };
    return;
  }

  const { memory } = channel;
  const ai = getAIProvider();
  const totalPosts = channel.posts.length;

  const memoryParams = memory
    ? {
        tone: memory.tone,
        aggressionLevel: memory.aggressionLevel,
        style: memory.style,
        avoidPatterns: memory.avoidPatterns as string[],
        forbiddenWords: memory.forbiddenWords as string[],
      }
    : undefined;

  const topic = channel.niche || channel.name;

  yield { event: 'phase', data: { phase: 'setup', message: `Preparing to generate ${totalPosts} posts...` } };

  // Fetch knowledge once for all posts
  const knowledge = await fetchTopicKnowledge(topic, 15).catch((err: unknown) => {
    console.warn(`[post-stream] Knowledge fetch failed: ${err instanceof Error ? err.message : 'unknown'}`);
    return undefined;
  });
  const knowledgeFacts = knowledge?.facts;

  let passCount = 0;
  let failCount = 0;
  const usedConcepts: string[] = [];

  for (let i = 0; i < totalPosts; i++) {
    const post = channel.posts[i];

    yield {
      event: 'post_start',
      data: {
        postIndex: i + 1,
        totalPosts,
        hook: post.hook,
      },
    };

    try {
      // Run the carousel pipeline for this post
      const result = await generateCarousel(
        {
          topic,
          hook: { text: post.hook, type: post.type },
          knowledgeFacts,
          memory: memoryParams,
          pattern: post.pattern || undefined,
          usedConcepts,
        },
        ai,
      );

      const { carousel, validation, qualityWarning, patchedSlideIndices, concept, compressedSlides } = result;
      usedConcepts.push(concept);

      if (validation.passed) passCount++;
      else failCount++;

      // Delete existing slides/caption for this post (in case of regeneration)
      await prisma.slide.deleteMany({ where: { postId: post.id } });
      await prisma.caption.deleteMany({ where: { postId: post.id } });

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
          hook: post.hook,
          type: post.type,
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

      // Update post
      await prisma.post.update({
        where: { id: post.id },
        data: { title: carousel.title, status: 'GENERATED' },
      });

      yield {
        event: 'post_complete',
        data: {
          postIndex: i + 1,
          totalPosts,
          post: {
            id: post.id,
            dayIndex: post.dayIndex,
            title: carousel.title,
            hook: post.hook,
            type: post.type,
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
      // Pipeline now has 5 fallback levels and should never throw.
      // If we still reach here, something truly unexpected happened.
      failCount++;
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[post-stream] Post ${i + 1}/${totalPosts} failed unexpectedly:`, message);

      yield {
        event: 'post_error',
        data: {
          postIndex: i + 1,
          totalPosts,
          hook: post.hook,
          error: message,
        },
      };

      // Continue with next post — don't abort the batch
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
        postCount: totalPosts,
        validationPassed: passCount,
        validationFailed: failCount,
        streamed: true,
      } as any,
    },
  });

  await prisma.channel.update({
    where: { id: channelId },
    data: { status: 'CONTENT_GENERATED' },
  });

  yield {
    event: 'complete',
    data: { totalPosts, passed: passCount, failed: failCount },
  };
}
