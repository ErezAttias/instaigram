import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createCarouselJob, runCarouselGeneration } from '@/lib/services/standalone-carousel-service';

// On Vercel, functions are torn down when the response returns unless we
// explicitly extend the lifetime. `maxDuration` lets the background job run
// up to 5 min (Pro plan ceiling); `waitUntil` below tells Vercel to keep the
// execution context alive for the promise we hand it.
export const maxDuration = 300;

/**
 * POST /api/carousel — Create a new carousel job and start generation.
 * Returns the jobId immediately; generation runs async via waitUntil.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const topic = body.topic?.trim();

    if (!topic) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 });
    }

    const direction = body.direction?.trim() || undefined;
    const channelId = body.channelId?.trim() || undefined;
    const skipImages = body.skipImages === true;
    const layout = 'BOLD' as const;

    // Pass topic as exactSubject to skip the concept selection LLM call
    const exactSubject = skipImages ? topic : undefined;
    const job = await createCarouselJob(topic, direction, channelId, undefined, exactSubject, layout);

    // Start generation in background (non-blocking). waitUntil keeps the
    // serverless execution context alive after we return the response so
    // the promise actually finishes in prod instead of being killed.
    waitUntil(
      runCarouselGeneration(job.id, undefined, { skipImages }).catch(err => {
        console.error(`[api/carousel] Background generation failed for ${job.id}: ${err.message}`);
      })
    );

    return NextResponse.json({ jobId: job.id, status: job.status }, { status: 201 });
  } catch (error) {
    console.error(`[api/carousel] POST error:`, error);
    return NextResponse.json({ error: 'GENERATION_FAILED' }, { status: 500 });
  }
}
