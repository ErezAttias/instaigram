import { NextRequest, NextResponse } from 'next/server';
import { approveCarousel } from '@/lib/services/standalone-carousel-service';

/**
 * POST /api/carousel/[jobId]/approve — Approve all slides and finalize carousel.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const result = await approveCarousel(jobId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : message.includes('not complete') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
