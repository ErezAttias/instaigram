import { NextRequest, NextResponse } from 'next/server';
import { generateCarouselCaption } from '@/lib/services/caption-service';

/**
 * POST /api/carousel/[jobId]/generate-caption
 * Generates caption + hashtags for an approved carousel.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const result = await generateCarouselCaption(jobId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('not found') ? 404
      : message.includes('must be approved') ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
