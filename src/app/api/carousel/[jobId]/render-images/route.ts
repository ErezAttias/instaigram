import { NextResponse } from 'next/server';
import { runImageStage } from '@/lib/services/standalone-carousel-service';

/**
 * POST /api/carousel/:jobId/render-images
 *
 * Renders images for a carousel that was generated with skipImages: true.
 * This is stage 2 of the two-stage workflow: generate copy → review → render images.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  try {
    // Fire-and-forget — rendering runs in background
    runImageStage(jobId).catch(err => {
      console.error(`[render-images] Background rendering failed for ${jobId}: ${err.message}`);
    });

    return NextResponse.json({ jobId, status: 'RENDERING' }, { status: 202 });
  } catch (error) {
    console.error(`[render-images] Error:`, error);
    return NextResponse.json({ error: 'RENDER_FAILED' }, { status: 500 });
  }
}
