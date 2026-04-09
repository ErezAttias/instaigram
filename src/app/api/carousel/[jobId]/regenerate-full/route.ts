import { NextRequest, NextResponse } from 'next/server';
import { runCarouselGeneration } from '@/lib/services/standalone-carousel-service';
import { prisma } from '@/lib/db/prisma';

/**
 * POST /api/carousel/[jobId]/regenerate-full
 *
 * Re-runs the full carousel generation pipeline for a failed / stuck job.
 * Resets the job status to PENDING so the pipeline can re-enter.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;

    const job = await prisma.carouselJob.findUnique({ where: { id: jobId } });
    if (!job) {
      return NextResponse.json({ error: 'Carousel job not found' }, { status: 404 });
    }

    // Delete any partial slides from the previous failed attempt
    await prisma.carouselSlide.deleteMany({ where: { carouselJobId: jobId } });

    // Reset job to PENDING so runCarouselGeneration starts fresh
    await prisma.carouselJob.update({
      where: { id: jobId },
      data: { status: 'PENDING', errorMessage: null, approved: false },
    });

    // Run generation (this is synchronous / awaited — callers should expect it
    // to take 30-90 s; use a background job queue for production scale)
    await runCarouselGeneration(jobId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[regenerate-full] ERROR:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
