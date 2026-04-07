import { prisma } from '@/lib/db/prisma';
import { SlideRole } from '@/generated/prisma/enums';
import { getAIProvider } from '@/lib/ai/provider';
import { buildCaptionGenerationPrompt } from '@/lib/prompts/caption-generation';
import { GeneratedCaption } from '@/lib/validation/schemas';
import { fetchTopicKnowledge } from '@/lib/external/topic-knowledge';
import { generateCarousel } from '@/lib/pipeline/carousel-pipeline';

export async function generatePosts(channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      memory: true,
      posts: {
        orderBy: { dayIndex: 'asc' },
      },
    },
  });

  if (!channel) {
    throw new Error('Channel not found');
  }

  if (!channel.posts || channel.posts.length === 0) {
    throw new Error('Channel has no hooks. Generate hooks first.');
  }

  const { memory } = channel;
  const ai = getAIProvider();

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
  const knowledge = await fetchTopicKnowledge(topic, 15).catch((err: unknown) => {
    console.warn(`[post-service] Knowledge fetch failed for "${topic}": ${err instanceof Error ? err.message : 'unknown error'}. Falling back to internal knowledge.`);
    return undefined;
  });
  const knowledgeFacts = knowledge?.facts;

  let validationPassCount = 0;
  let validationFailCount = 0;
  let patchedSlideTotal = 0;
  const usedConcepts: string[] = [];

  let fallbackCount = 0;

  for (let i = 0; i < channel.posts.length; i++) {
    const post = channel.posts[i];
    console.log(`[post-service] Generating post ${i + 1}/${channel.posts.length}...`);

    // ─── V2 Pipeline with fallback hierarchy (never returns empty)
    const result = await generateCarousel(
      {
        topic,
        hook: {
          text: post.hook,
          type: post.type,
        },
        knowledgeFacts,
        memory: memoryParams,
        pattern: post.pattern || undefined,
        usedConcepts,
      },
      ai,
    );

    const { carousel, validation, qualityWarning, patchedSlideIndices, concept, compressedSlides, fallback } = result;

    // Track concept to prevent duplicates across the 30-post batch
    usedConcepts.push(concept);

    if (validation.passed) {
      validationPassCount++;
    } else {
      validationFailCount++;
    }
    patchedSlideTotal += patchedSlideIndices.length;
    if (fallback) fallbackCount++;

    // Log validation results
    console.log(
      `  Post ${i + 1} [${result.mode}: "${concept}"]: score ${validation.score}/100, ` +
      `hard fails: ${validation.hardFails.length}, ` +
      `soft flags: ${validation.softFlags.length}` +
      (patchedSlideIndices.length > 0 ? `, patched slides: [${patchedSlideIndices.join(', ')}]` : '') +
      (qualityWarning ? ' ⚠ quality warning' : '') +
      (fallback ? ` ⚠ fallback: ${fallback.level}` : '')
    );

    // Create Slide records (6-7 slides per post: OPENER + 3-4 FACTs + IMPLICATION + CTA)
    await Promise.all(
      carousel.slides.map(slide => {
        const compressed = compressedSlides.find(c => c.slideNumber === slide.slideNumber);
        return prisma.slide.create({
          data: {
            postId: post.id,
            slideIndex: slide.slideNumber,
            role: slide.role as SlideRole,
            // V1 compat: concatenate headline + body into text field
            text: slide.body ? `${slide.headline} — ${slide.body}` : slide.headline,
            // V2 structured fields
            headline: slide.headline,
            body: slide.body,
            supportingDetail: slide.supportingDetail,
            factType: slide.factType,
            containsNumber: slide.containsNumber,
            concretenessScore: slide.concretenessScore,
            noveltyScore: slide.noveltyScore,
            topicEntity: slide.topicEntity,
            qualityPassed: !validation.slidesToRegenerate.includes(slide.slideNumber),
            // Compressed display fields
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

    // Update post title and status
    await prisma.post.update({
      where: { id: post.id },
      data: {
        title: carousel.title,
        status: 'GENERATED',
      },
    });
  }

  console.log(
    `[post-service] Results: ${validationPassCount} passed, ${validationFailCount} failed ` +
    `out of ${channel.posts.length} posts (${patchedSlideTotal} slides patched, ${fallbackCount} fallbacks)`
  );

  // Create generation job record
  await prisma.generationJob.create({
    data: {
      channelId,
      jobType: 'POST_GENERATION',
      status: 'COMPLETED',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: {
        postCount: channel.posts.length,
        validationPassed: validationPassCount,
        validationFailed: validationFailCount,
        patchedSlideTotal,
        fallbackCount,
      } as any,
    },
  });

  // Update channel status
  await prisma.channel.update({
    where: { id: channelId },
    data: { status: 'CONTENT_GENERATED' },
  });

  // Return posts with slides and captions
  const posts = await prisma.post.findMany({
    where: { channelId },
    orderBy: { dayIndex: 'asc' },
    include: {
      slides: { orderBy: { slideIndex: 'asc' } },
      caption: true,
    },
  });

  return posts;
}

export async function getPost(postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      slides: { orderBy: { slideIndex: 'asc' } },
      caption: true,
    },
  });

  if (!post) {
    throw new Error('Post not found');
  }

  // Ensure every V2 slide has display fields (defensive fallback)
  const slides = post.slides.map(slide => {
    if (slide.headline && !slide.displayTitle) {
      return {
        ...slide,
        displayTitle: truncateWords(slide.headline, 10),
        displaySupport: slide.body ? truncateWords(slide.body.split(/(?<=[.!?])\s+/)[0] || '', 15) : '',
      };
    }
    return slide;
  });

  return { ...post, slides };
}

/** Take first N words from text */
function truncateWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return text.trim();
  return words.slice(0, max).join(' ');
}

export async function getPosts(channelId: string) {
  const posts = await prisma.post.findMany({
    where: { channelId },
    orderBy: { dayIndex: 'asc' },
    include: {
      slides: { orderBy: { slideIndex: 'asc' } },
      caption: true,
    },
  });

  // Ensure every V2 slide has display fields (defensive fallback)
  return posts.map(post => ({
    ...post,
    slides: post.slides.map(slide => {
      if (slide.headline && !slide.displayTitle) {
        return {
          ...slide,
          displayTitle: truncateWords(slide.headline, 10),
          displaySupport: slide.body ? truncateWords(slide.body.split(/(?<=[.!?])\s+/)[0] || '', 15) : '',
        };
      }
      return slide;
    }),
  }));
}
