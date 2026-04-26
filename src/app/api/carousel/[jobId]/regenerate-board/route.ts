import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { runBakedDesignBoardPhase1 } from '@/lib/services/standalone-carousel-service';

export const maxDuration = 300;

/**
 * POST /api/carousel/:jobId/regenerate-board
 *
 * The user wasn't happy with the design board (or Phase 1 failed). Re-run
 * Phase 1 to produce a fresh board with the same slide content. The new
 * board overwrites the old `pipelineMeta.designBoardUrl`.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  try {
    waitUntil(
      runBakedDesignBoardPhase1(jobId).catch(err => {
        console.error(`[regenerate-board] Phase 1 failed for ${jobId}: ${err instanceof Error ? err.message : err}`);
      }),
    );
    return NextResponse.json({ jobId, status: 'RENDERING' }, { status: 202 });
  } catch (error) {
    console.error('[regenerate-board] Error:', error);
    return NextResponse.json({ error: 'REGENERATE_BOARD_FAILED' }, { status: 500 });
  }
}
