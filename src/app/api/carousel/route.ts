import { NextRequest, NextResponse } from 'next/server';
import { createCarouselJob, runCarouselGeneration } from '@/lib/services/standalone-carousel-service';

/**
 * POST /api/carousel — Create a new carousel job and start generation.
 * Returns the jobId immediately; generation runs async.
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

    const job = await createCarouselJob(topic, direction, channelId);

    // Start generation in background (non-blocking)
    runCarouselGeneration(job.id).catch(err => {
      console.error(`[api/carousel] Background generation failed for ${job.id}: ${err.message}`);
    });

    return NextResponse.json({ jobId: job.id, status: job.status }, { status: 201 });
  } catch (error) {
    console.error(`[api/carousel] POST error:`, error);
    return NextResponse.json({ error: 'GENERATION_FAILED' }, { status: 500 });
  }
}
