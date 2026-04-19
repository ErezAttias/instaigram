import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCarouselJob } from '@/lib/services/standalone-carousel-service';
import { deleteCarousel } from '@/lib/services/admin-service';

/**
 * GET /api/carousel/[jobId] — Get carousel job with all slides.
 * Also resolves caption from the linked Post's Caption record when
 * the CarouselJob itself has no caption stored.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const job = await getCarouselJob(jobId);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Sanitize errorMessage — log the raw error, return generic message to client
    if (job.errorMessage) {
      console.error(`[api/carousel/${jobId}] Job error: ${job.errorMessage}`);
      return NextResponse.json({ ...job, errorMessage: 'GENERATION_FAILED' });
    }

    // If the CarouselJob has no caption, try to resolve it from the linked Post's Caption record
    let caption = job.caption;
    let hashtags = job.hashtags;
    if (!caption) {
      const post = await prisma.post.findFirst({
        where: { carouselJobId: jobId },
        include: { caption: true },
      });
      if (post?.caption) {
        caption = post.caption.text;
        hashtags = (post.caption.hashtags as string[]) || [];
      }
    }

    return NextResponse.json({ ...job, caption, hashtags });
  } catch (error) {
    console.error(`[api/carousel] GET error:`, error);
    return NextResponse.json({ error: 'GENERATION_FAILED' }, { status: 500 });
  }
}

/**
 * DELETE /api/carousel/[jobId] — Delete a carousel job + all its slides.
 * Powers the trash icon on the flattened dashboard.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    await deleteCarousel(jobId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[api/carousel] DELETE error:`, error);
    return NextResponse.json({ error: 'DELETE_FAILED' }, { status: 500 });
  }
}
