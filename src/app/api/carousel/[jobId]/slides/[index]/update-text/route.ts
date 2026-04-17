import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { prisma } from '@/lib/db/prisma';
import { restyleCarouselSlide } from '@/lib/services/standalone-carousel-service';

// Restyle is fast (no AI call) but extend timeout for safety.
export const maxDuration = 60;

interface UpdateTextBody {
  displayTitle?: string;
  displaySupport?: string;
}

/**
 * POST /api/carousel/:jobId/slides/:index/update-text
 *
 * Lets the user edit a slide's headline/body text directly on the viewer
 * and re-composites the text overlay without re-running the AI image
 * provider. Relies on the saved raw (pre-overlay) image.
 *
 * Note: path param is `index` (not `slideIndex`) to match the sibling
 * `/slides/[index]/image` route — Next.js requires consistent slug names.
 *
 * Body: { displayTitle?: string; displaySupport?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string; index: string }> },
) {
  try {
    const { jobId, index: slideIndexRaw } = await params;
    const slideIndex = Number(slideIndexRaw);
    if (!Number.isFinite(slideIndex)) {
      return NextResponse.json({ error: 'invalid slideIndex' }, { status: 400 });
    }

    const body: UpdateTextBody = await request.json();
    const hasTitleEdit = typeof body.displayTitle === 'string';
    const hasBodyEdit = typeof body.displaySupport === 'string';
    if (!hasTitleEdit && !hasBodyEdit) {
      return NextResponse.json(
        { error: 'displayTitle or displaySupport is required' },
        { status: 400 },
      );
    }

    // Persist the user's text, then re-composite using the saved raw image.
    await prisma.carouselSlide.update({
      where: { carouselJobId_slideIndex: { carouselJobId: jobId, slideIndex } },
      data: {
        displayTitle: hasTitleEdit ? body.displayTitle : undefined,
        displaySupport: hasBodyEdit ? body.displaySupport : undefined,
      },
    });

    // Invalidate approval so the user has to re-approve after an edit.
    await prisma.carouselJob.update({
      where: { id: jobId },
      data: { approved: false },
    });

    // Run re-composite in the background so the request returns fast.
    waitUntil(
      restyleCarouselSlide(jobId, slideIndex).catch(err => {
        console.error(`[update-text] restyle failed for ${jobId}/${slideIndex}: ${err.message}`);
      }),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[update-text] ERROR:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
