import { NextRequest, NextResponse } from 'next/server';
import {
  regenerateCarouselSlideCopy,
  regenerateCarouselSlideImage,
  regenerateCarouselSlide,
} from '@/lib/services/standalone-carousel-service';
import { prisma } from '@/lib/db/prisma';

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
    const { slideIndex, mode, imageSource } = body;

    if (typeof slideIndex !== 'number') {
      return NextResponse.json({ error: 'slideIndex is required' }, { status: 400 });
    }

    const resolvedImageSource: 'wikipedia' | 'generated' | undefined =
      imageSource === 'wikipedia' || imageSource === 'generated' ? imageSource : undefined;

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
