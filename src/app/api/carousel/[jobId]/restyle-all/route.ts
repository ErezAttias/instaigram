import { NextRequest, NextResponse } from 'next/server';
import { regenerateCarouselSlideImage } from '@/lib/services/standalone-carousel-service';
import { prisma } from '@/lib/db/prisma';

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

    // Re-render each slide image sequentially (avoids concurrency issues with font loading)
    for (const slide of job.slides) {
      await regenerateCarouselSlideImage(jobId, slide.slideIndex);
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
