import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { runBakedDesignBoardPhase2 } from '@/lib/services/standalone-carousel-service';

export const maxDuration = 300;

/**
 * POST /api/carousel/:jobId/approve-board
 *
 * The user has reviewed the design board and approved it. Kick off Phase 2
 * (per-slide regeneration) in the background and return 202 immediately so
 * the UI can flip to the rendering view.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  try {
    waitUntil(
      runBakedDesignBoardPhase2(jobId).catch(err => {
        console.error(`[approve-board] Phase 2 failed for ${jobId}: ${err instanceof Error ? err.message : err}`);
      }),
    );
    return NextResponse.json({ jobId, status: 'RENDERING' }, { status: 202 });
  } catch (error) {
    console.error('[approve-board] Error:', error);
    return NextResponse.json({ error: 'APPROVE_BOARD_FAILED' }, { status: 500 });
  }
}
