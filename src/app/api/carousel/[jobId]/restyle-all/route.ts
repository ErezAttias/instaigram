import { NextRequest, NextResponse } from 'next/server';
import { restyleCarouselSlide } from '@/lib/services/standalone-carousel-service';
import { prisma } from '@/lib/db/prisma';

// Restyling all slides sequentially can take 30-120s
export const maxDuration = 180;

/**
 * POST /api/carousel/[jobId]/restyle-all
 *
 * Re-renders every slide image in the carousel using the channel's current
 * saved visual style. Text content is untouched.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;

    const job = await prisma.carouselJob.findUnique({
      where: { id: jobId },
      include: { slides: { orderBy: { slideIndex: 'asc' } } },
    });

    if (!job) {
      return NextResponse.json({ error: 'Carousel job not found' }, { status: 404 });
    }

    // Re-render each slide's text overlay using the channel's current visual style.
    // Uses the saved raw image (before overlay) to avoid regenerating base images.
    // Falls back to full regen if no raw image exists (older carousels).
    for (const slide of job.slides) {
      await restyleCarouselSlide(jobId, slide.slideIndex);
    }

    // Invalidate approval
    await prisma.carouselJob.update({
      where: { id: jobId },
      data: { approved: false },
    });

    return NextResponse.json({ success: true, slideCount: job.slides.length });
  } catch (error) {
    console.error('[restyle-all] ERROR:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
