import { NextRequest, NextResponse } from 'next/server';
import { regenerateArticle } from '@/lib/services/article-service';

/**
 * POST /api/carousel/[jobId]/regenerate-article
 * Regenerates the mini-article for a carousel job.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const article = await regenerateArticle(jobId);
    return NextResponse.json({ article });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
