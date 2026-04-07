import { prisma } from '@/lib/db/prisma';
import { SlideRole } from '@/generated/prisma/enums';
import { getAIProvider } from '@/lib/ai/provider';
import { buildRegenerateHookPrompt } from '@/lib/prompts/regeneration';
import {
  GeneratedHook,
  GeneratedCaption,
  PatchedSlide,
  type GeneratedSlideV2,
} from '@/lib/validation/schemas';
import { buildCaptionGenerationPrompt } from '@/lib/prompts/caption-generation';
import { buildUserRegenSlidePrompt } from '@/lib/pipeline/prompts/user-regen-slide-prompt';
import { jaccardSimilarity } from '@/lib/utils/similarity';
import { generateCarousel } from '@/lib/pipeline/carousel-pipeline';
import { inferContentStyle } from '@/lib/utils/content-style-inferrer';
import { compressSlides } from '@/lib/pipeline/steps/compress';

// ─── Helper: Load Channel Context ────────────────────────────
// Still needed by regenerateHook (v1 hook system unchanged)

async function getChannelContext(channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      memory: true,
    },
  });

  if (!channel) {
    throw new Error('Channel not found');
  }

  if (!channel.niche) {
    throw new Error('No niche selected for this channel');
  }

  const positioning = inferContentStyle(channel.niche || channel.name);

  return {
    channel,
    context: {
      channelName: channel.name,
      niche: channel.niche,
      positioning: {
        angle: positioning.angle,
        tone: positioning.tone,
        contentStyle: positioning.contentStyle,
        audienceFeel: positioning.audienceFeel,
      },
      memory: channel.memory
        ? {
            tone: channel.memory.tone,
            aggressionLevel: channel.memory.aggressionLevel,
            style: channel.memory.style,
            avoidPatterns: channel.memory.avoidPatterns as string[],
            preferredHooks: channel.memory.preferredHooks as string[],
            forbiddenWords: channel.memory.forbiddenWords as string[],
          }
        : undefined,
    },
  };
}

// ─── Regenerate Hook ─────────────────────────────────────────

export async function regenerateHook(postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
  });

  if (!post) {
    throw new Error('Post not found');
  }

  const { context } = await getChannelContext(post.channelId);

  // Get all other hooks in the channel to avoid duplicates
  const otherPosts = await prisma.post.findMany({
    where: {
      channelId: post.channelId,
      id: { not: postId },
    },
    select: { hook: true, type: true },
  });

  const existingHooks = otherPosts.map((p: { hook: string; type: string }) => ({
    text: p.hook,
    type: p.type,
  }));

  const prompt = buildRegenerateHookPrompt({
    existingHooks,
    channelContext: context,
  });

  const ai = getAIProvider();
  const { data: generated } = await ai.generateObject(prompt, GeneratedHook);

  // Similarity guard: warn if the new hook is too similar to the old one
  const similarity = jaccardSimilarity(post.hook, generated.text);
  if (similarity > 0.7) {
    console.warn(
      `[regeneration] New hook is ${Math.round(similarity * 100)}% similar to the old hook. ` +
      `Old: "${post.hook}" | New: "${generated.text}"`
    );
  }

  // Update the post's hook
  const updatedPost = await prisma.post.update({
    where: { id: postId },
    data: {
      hook: generated.text,
      type: generated.type,
    },
    include: {
      slides: { orderBy: { slideIndex: 'asc' } },
      caption: true,
    },
  });

  // Log the regeneration job
  await prisma.generationJob.create({
    data: {
      channelId: post.channelId,
      postId,
      jobType: 'REGENERATION',
      status: 'COMPLETED',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: { type: 'hook', newHook: generated.text } as any,
    },
  });

  return updatedPost;
}

// ─── Regenerate Post ─────────────────────────────────────────

export async function regeneratePost(postId: string) {
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

  const { channel } = await getChannelContext(post.channelId);
  const ai = getAIProvider();
  const topic = channel.niche || channel.name;

  const memoryParams = channel.memory
    ? {
        tone: channel.memory.tone,
        aggressionLevel: channel.memory.aggressionLevel,
        style: channel.memory.style,
        avoidPatterns: channel.memory.avoidPatterns as string[],
        forbiddenWords: channel.memory.forbiddenWords as string[],
      }
    : undefined;

  // Run full v2 pipeline to generate a completely new carousel
  const result = await generateCarousel(
    {
      topic,
      hook: { text: post.hook, type: post.type },
      memory: memoryParams,
      pattern: post.pattern || undefined,
    },
    ai,
  );

  const { carousel, validation, compressedSlides } = result;

  // Delete existing slides and caption
  await prisma.slide.deleteMany({ where: { postId } });
  await prisma.caption.deleteMany({ where: { postId } });

  // Create new slides (5-6)
  await Promise.all(
    carousel.slides.map(slide => {
      const compressed = compressedSlides.find(c => c.slideNumber === slide.slideNumber);
      return prisma.slide.create({
        data: {
          postId,
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

  // Generate new caption
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
      postId,
      text: generatedCaption.text,
      hashtags: generatedCaption.hashtags,
    },
  });

  // Update post title
  const updatedPost = await prisma.post.update({
    where: { id: postId },
    data: {
      title: carousel.title,
    },
    include: {
      slides: { orderBy: { slideIndex: 'asc' } },
      caption: true,
    },
  });

  // Log the regeneration job
  await prisma.generationJob.create({
    data: {
      channelId: post.channelId,
      postId,
      jobType: 'REGENERATION',
      status: 'COMPLETED',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: { type: 'post', newTitle: carousel.title } as any,
    },
  });

  return updatedPost;
}

// ─── Regenerate Slide ────────────────────────────────────────

export async function regenerateSlide(postId: string, slideIndex: number) {
  if (slideIndex < 0 || slideIndex > 7) {
    throw new Error('slideIndex must be between 0 and 7');
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      slides: { orderBy: { slideIndex: 'asc' } },
    },
  });

  if (!post) {
    throw new Error('Post not found');
  }

  const slide = post.slides.find((s: { slideIndex: number }) => s.slideIndex === slideIndex);

  if (!slide) {
    throw new Error(`Slide at index ${slideIndex} not found for this post`);
  }

  const { channel } = await getChannelContext(post.channelId);
  const topic = channel.niche || channel.name;

  // Determine if this is a v2 slide (has headline) or v1 slide (only has text)
  const isV2 = slide.headline !== null;

  if (isV2) {
    // V2 path: use the new user-regen prompt
    const slideContext = post.slides.map((s: { slideIndex: number; role: string; headline: string | null; body: string | null; text: string; supportingDetail: string | null }) => ({
      slideIndex: s.slideIndex,
      role: s.role,
      headline: s.headline || s.text,
      body: s.body || '',
      supportingDetail: s.supportingDetail || null,
    }));

    const targetRole = slide.role as 'OPENER' | 'FACT' | 'IMPLICATION';
    const prompt = buildUserRegenSlidePrompt({
      topic,
      slides: slideContext,
      targetIndex: slideIndex,
      targetRole,
    });

    const ai = getAIProvider();
    let generated: PatchedSlide;
    try {
      const result = await ai.generateObject(prompt, PatchedSlide);
      generated = result.data;
    } catch (firstError) {
      const errorMsg = firstError instanceof Error ? firstError.message : String(firstError);
      console.warn(`[regeneration] Slide regen failed, retrying with error feedback: ${errorMsg.slice(0, 200)}`);

      const retryPrompt = prompt + `\n\n═══════════════════════════════════════════
RETRY — YOUR PREVIOUS OUTPUT FAILED VALIDATION
═══════════════════════════════════════════

Your previous response was rejected with this error:
${errorMsg.slice(0, 500)}

Fix the issue and return valid JSON. Pay special attention to:
- factType must be EXACTLY one of: statistic, comparison, mechanism, historical, example, definition
- headline must be 20-100 characters
- FACT body must be 140-400 characters`;

      const retryResult = await ai.generateObject(retryPrompt, PatchedSlide);
      generated = retryResult.data;
      console.log('[regeneration] Slide regen succeeded on retry.');
    }

    // Similarity guard on headline + body
    const oldContent = `${slide.headline} ${slide.body || ''}`;
    const newContent = `${generated.headline} ${generated.body}`;
    const similarity = jaccardSimilarity(oldContent, newContent);
    if (similarity > 0.7) {
      console.warn(
        `[regeneration] New ${slide.role} slide is ${Math.round(similarity * 100)}% similar to old.`
      );
    }

    // Compress the regenerated slide for display
    const slideAsV2: GeneratedSlideV2 = {
      slideNumber: slideIndex,
      role: generated.role,
      headline: generated.headline,
      body: generated.body,
      supportingDetail: generated.supportingDetail,
      factType: generated.factType,
      containsNumber: generated.containsNumber,
      concretenessScore: generated.concretenessScore,
      noveltyScore: generated.noveltyScore,
      topicEntity: generated.topicEntity,
      factRefs: generated.factRefs,
    };
    // For IMPLICATION slides, pass all slides so the compressor has fact context
    let slidesForCompress: GeneratedSlideV2[];
    if (generated.role === 'IMPLICATION') {
      slidesForCompress = post.slides.map((s) => {
        // Use the newly generated content for the target slide
        if (s.slideIndex === slideIndex) return slideAsV2;
        return {
          slideNumber: s.slideIndex,
          role: s.role as 'OPENER' | 'FACT' | 'IMPLICATION' | 'CTA',
          headline: s.headline || s.text,
          body: s.body || '',
          supportingDetail: s.supportingDetail || null,
          factType: s.factType as 'statistic' | 'comparison' | 'mechanism' | 'historical' | 'example' | 'definition' | null,
          containsNumber: s.containsNumber ?? false,
          concretenessScore: s.concretenessScore ?? 3,
          noveltyScore: s.noveltyScore ?? 3,
          topicEntity: s.topicEntity || null,
          factRefs: [],
        };
      });
    } else {
      slidesForCompress = [slideAsV2];
    }
    const compressResult = await compressSlides({ topic, slides: slidesForCompress }, ai);
    const compressed = compressResult.compressed.find(c => c.slideNumber === slideIndex);

    // Update the slide with all v2 fields + compressed display
    const updatedSlide = await prisma.slide.update({
      where: { id: slide.id },
      data: {
        text: generated.body ? `${generated.headline} — ${generated.body}` : generated.headline,
        headline: generated.headline,
        body: generated.body,
        supportingDetail: generated.supportingDetail,
        factType: generated.factType,
        containsNumber: generated.containsNumber,
        concretenessScore: generated.concretenessScore,
        noveltyScore: generated.noveltyScore,
        topicEntity: generated.topicEntity,
        qualityPassed: true, // User-initiated regen — trust the output
        displayTitle: compressed?.displayTitle ?? null,
        displaySupport: compressed?.displaySupport ?? null,
      },
    });

    await prisma.generationJob.create({
      data: {
        channelId: post.channelId,
        postId,
        jobType: 'REGENERATION',
        status: 'COMPLETED',
        result: {
          type: 'slide',
          slideIndex,
          role: slide.role,
          newHeadline: generated.headline,
        } as any,
      },
    });

    return updatedSlide;
  } else {
    // V1 fallback: use old-style regeneration for legacy slides
    const { context } = await getChannelContext(post.channelId);
    const { buildRegenerateSlidePrompt } = await import('@/lib/prompts/regeneration');
    const { GeneratedSlide } = await import('@/lib/validation/schemas');

    const prompt = buildRegenerateSlidePrompt({
      existingSlide: {
        role: slide.role,
        text: slide.text,
        slideIndex: slide.slideIndex,
      },
      postContext: {
        title: post.title,
        hook: post.hook,
        type: post.type,
        slides: post.slides.map((s: { role: string; text: string }) => ({ role: s.role, text: s.text })),
      },
      channelContext: context,
    });

    const ai = getAIProvider();
    const { data: generated } = await ai.generateObject(prompt, GeneratedSlide);

    const similarity = jaccardSimilarity(slide.text, generated.text);
    if (similarity > 0.7) {
      console.warn(
        `[regeneration] New ${slide.role} slide is ${Math.round(similarity * 100)}% similar to old.`
      );
    }

    const updatedSlide = await prisma.slide.update({
      where: { id: slide.id },
      data: { text: generated.text },
    });

    await prisma.generationJob.create({
      data: {
        channelId: post.channelId,
        postId,
        jobType: 'REGENERATION',
        status: 'COMPLETED',
        result: {
          type: 'slide',
          slideIndex,
          role: slide.role,
          newText: generated.text,
        } as any,
      },
    });

    return updatedSlide;
  }
}
