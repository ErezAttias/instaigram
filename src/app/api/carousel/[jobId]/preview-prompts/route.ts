import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { buildSlidePrompt } from '@/lib/visual/prompt-builder';
import { isCelebrityTopic } from '@/lib/ai/image-provider';

/**
 * GET /api/carousel/:jobId/preview-prompts
 *
 * Returns the image prompts that WOULD be generated for each slide,
 * without actually rendering any images. Allows user to review
 * planned visuals before committing to image generation.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  try {
    const job = await prisma.carouselJob.findUnique({
      where: { id: jobId },
      include: { slides: { orderBy: { slideIndex: 'asc' } } },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const isCelebrity = isCelebrityTopic(job.topic, job.direction);
    const meta = job.pipelineMeta as Record<string, unknown> | null;
    const concept = (meta?.concept as string) || job.topic;

    const previews = job.slides.map(slide => {
      const displayTitle = slide.displayTitle || slide.headline || '';
      const subject = slide.topicEntity || concept;

      const promptOutput = buildSlidePrompt({
        slideRole: slide.role === 'CTA' ? 'CTA' : slide.role === 'OPENER' ? 'HOOK' : slide.role,
        subject,
        topic: job.topic,
        headlineText: displayTitle,
      });

      return {
        slideIndex: slide.slideIndex,
        role: slide.role,
        displayTitle,
        displaySupport: slide.displaySupport || '',
        imagePrompt: promptOutput.imagePrompt,
        canUseWikipedia: isCelebrity || false,
        hasImage: !!slide.imageUrl,
      };
    });

    return NextResponse.json({ jobId, isCelebrity, previews });
  } catch (error) {
    console.error('[preview-prompts] Error:', error);
    return NextResponse.json({ error: 'Failed to generate previews' }, { status: 500 });
  }
}
