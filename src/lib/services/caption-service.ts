import { prisma } from '@/lib/db/prisma';
import { getAIProvider } from '@/lib/ai/provider';
import { buildCaptionGenerationPrompt } from '@/lib/prompts/caption-generation';
import { GeneratedCaption } from '@/lib/validation/schemas';

/**
 * Generates a caption and hashtags for an approved carousel job.
 * Uses the existing caption generation prompt + AI provider.
 * Stores the result on the CarouselJob record.
 */
export async function generateCarouselCaption(jobId: string) {
  const job = await prisma.carouselJob.findUnique({
    where: { id: jobId },
    include: { slides: { orderBy: { slideIndex: 'asc' } } },
  });

  if (!job) throw new Error('CarouselJob not found');
  if (!job.approved) throw new Error('Carousel must be approved before generating caption');

  // Build prompt from slide content
  const prompt = buildCaptionGenerationPrompt({
    channelName: 'Your Profile',
    post: {
      title: job.topic,
      hook: job.slides[0]?.headline || job.topic,
      type: 'INFORMATIONAL',
    },
    slides: job.slides.map(s => ({
      role: s.role,
      headline: s.headline ?? undefined,
      body: s.body ?? undefined,
      supportingDetail: s.supportingDetail,
    })),
    article: job.article ?? undefined,
  });

  const ai = getAIProvider();
  const { data } = await ai.generateObject(prompt, GeneratedCaption);

  // Persist caption + hashtags
  const updated = await prisma.carouselJob.update({
    where: { id: jobId },
    data: {
      caption: data.text,
      hashtags: data.hashtags,
    },
    include: { slides: { orderBy: { slideIndex: 'asc' } } },
  });

  return {
    caption: updated.caption,
    hashtags: updated.hashtags,
  };
}
