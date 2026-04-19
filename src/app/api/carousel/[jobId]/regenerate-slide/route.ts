import { NextRequest, NextResponse } from 'next/server';
import {
  regenerateCarouselSlideCopy,
  regenerateCarouselSlideImage,
  regenerateCarouselSlide,
} from '@/lib/services/standalone-carousel-service';
import { prisma } from '@/lib/db/prisma';

// Image generation + rendering can take 20-30s — extend Vercel function timeout
export const maxDuration = 60;

/**
 * POST /api/carousel/[jobId]/regenerate-slide — Regenerate a slide.
 *
 * Body: { slideIndex: number, mode: "copy" | "image" | "full" }
 *
 * After any successful regeneration, resets job.approved to false
 * so the user must re-approve before exporting.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const body = await request.json();
    const { slideIndex, mode, imageSource, promptOverride, wikipediaImageUrl, wikipediaQuery } = body;

    if (typeof slideIndex !== 'number') {
      return NextResponse.json({ error: 'slideIndex is required' }, { status: 400 });
    }

    const resolvedImageSource: 'wikipedia' | 'generated' | undefined =
      imageSource === 'wikipedia' || imageSource === 'generated' ? imageSource : undefined;

    // Persist the edited prompt before regeneration so the renderer picks it up
    // via CarouselSlide.imagePromptOverride. `null` clears any prior override.
    if (promptOverride !== undefined && (mode === 'image' || mode === 'full')) {
      const trimmed = typeof promptOverride === 'string' ? promptOverride.trim() : null;
      await prisma.carouselSlide.updateMany({
        where: { carouselJobId: jobId, slideIndex },
        data: { imagePromptOverride: trimmed && trimmed.length > 0 ? trimmed : null },
      });
    }

    // Persist Wikipedia pick before regeneration so the image service resolves
    // forcedImageUrl via CarouselSlide.imageSourceUrl.
    if (resolvedImageSource === 'wikipedia' && typeof wikipediaImageUrl === 'string' && wikipediaImageUrl.length > 0) {
      await prisma.carouselSlide.updateMany({
        where: { carouselJobId: jobId, slideIndex },
        data: {
          imageSource: 'wikipedia',
          imageSourceUrl: wikipediaImageUrl,
          ...(typeof wikipediaQuery === 'string' && wikipediaQuery.length > 0 ? { wikipediaQuery } : {}),
        },
      });
    }

    let result;
    switch (mode) {
      case 'copy':
        result = await regenerateCarouselSlideCopy(jobId, slideIndex);
        break;
      case 'image':
        result = await regenerateCarouselSlideImage(jobId, slideIndex, resolvedImageSource);
        break;
      case 'full':
      default:
        result = await regenerateCarouselSlide(jobId, slideIndex, resolvedImageSource);
        break;
    }

    // Invalidate approval — user must re-approve after any change
    await prisma.carouselJob.update({
      where: { id: jobId },
      data: { approved: false },
    });

    return NextResponse.json({ success: true, slideId: result.id });
  } catch (error) {
    console.error('[regenerate-slide] ERROR:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
