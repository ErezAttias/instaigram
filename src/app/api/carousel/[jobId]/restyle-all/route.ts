import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export const maxDuration = 10;

/**
 * POST /api/carousel/[jobId]/restyle-all
 *
 * Since text is rendered as a live CSS overlay on the preview (not baked into
 * the stored image), a design change no longer requires re-compositing each
 * slide. This endpoint just invalidates approval so the user re-approves the
 * updated design. Compositing happens on demand at publish time.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;

    const job = await prisma.carouselJob.findUnique({
      where: { id: jobId },
      select: { id: true, slides: { select: { id: true } } },
    });
    if (!job) {
      return NextResponse.json({ error: 'Carousel job not found' }, { status: 404 });
    }

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
