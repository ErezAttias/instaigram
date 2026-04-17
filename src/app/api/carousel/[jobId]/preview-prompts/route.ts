import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { buildSlidePrompt } from '@/lib/visual/prompt-builder';

/**
 * GET /api/carousel/:jobId/preview-prompts
 *
 * Returns per-slide metadata the ImagePreviewStep needs to let the user
 * review and tweak image prompts before rendering. Includes:
 *  - `imagePrompt` — the currently-effective prompt (override or computed)
 *  - `defaultPrompt` — the auto-generated prompt (so "reset to default" is cheap)
 *  - `source` — user's previously-chosen source ('ai' | 'wikipedia'), defaulting to 'ai'
 *  - `wikipediaQuery` — previously-saved Wikipedia search, or a sensible default
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

    const meta = job.pipelineMeta as Record<string, unknown> | null;
    const concept = (meta?.concept as string) || job.topic;

    const previews = job.slides.map(slide => {
      const displayTitle = slide.displayTitle || slide.headline || '';
      const subject = slide.topicEntity || concept;

      const defaultPrompt = buildSlidePrompt({
        slideRole: slide.role === 'CTA' ? 'CTA' : slide.role === 'OPENER' ? 'HOOK' : slide.role,
        subject,
        topic: job.topic,
        headlineText: displayTitle,
      }).imagePrompt;

      // Prefer the user's saved override; otherwise surface the freshly-computed default.
      const imagePrompt = slide.imagePromptOverride ?? defaultPrompt;

      // Sensible default query for the Wikipedia search box: saved query > topic entity > display title > global topic.
      const defaultWikipediaQuery =
        slide.wikipediaQuery ??
        slide.topicEntity ??
        (displayTitle && displayTitle.length < 80 ? displayTitle : null) ??
        job.topic;

      return {
        slideIndex: slide.slideIndex,
        role: slide.role,
        displayTitle,
        displaySupport: slide.displaySupport || '',
        imagePrompt,
        defaultPrompt,
        source: (slide.imageSource === 'wikipedia' ? 'wikipedia' : 'ai') as 'ai' | 'wikipedia',
        wikipediaQuery: defaultWikipediaQuery,
        wikipediaImageUrl: slide.imageSource === 'wikipedia' ? slide.imageSourceUrl : null,
        hasImage: !!slide.imageUrl,
      };
    });

    return NextResponse.json({ jobId, previews });
  } catch (error) {
    console.error('[preview-prompts] Error:', error);
    return NextResponse.json({ error: 'Failed to generate previews' }, { status: 500 });
  }
}
