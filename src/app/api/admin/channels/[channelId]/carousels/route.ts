import { NextRequest, NextResponse } from 'next/server';
import { getChannelCarousels } from '@/lib/services/admin-service';
import { createCarouselJob, runCarouselGeneration } from '@/lib/services/standalone-carousel-service';
import type { CarouselJobStatus } from '@/generated/prisma/enums';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId } = await params;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as CarouselJobStatus | null;

    const carousels = await getChannelCarousels(
      channelId,
      status ? { status } : undefined
    );

    return NextResponse.json(carousels);
  } catch (error) {
    console.error('[admin/channels/[id]/carousels] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch carousels' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId } = await params;
    const body = await request.json();
    const topic = body.topic?.trim();

    if (!topic) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 });
    }

    const direction = body.direction?.trim() || undefined;
    const exactSubject = body.exactSubject?.trim() || undefined;
    const job = await createCarouselJob(topic, direction, channelId, undefined, exactSubject);

    // Start generation in background
    runCarouselGeneration(job.id).catch(err => {
      console.error(`[admin/carousels] Background generation failed for ${job.id}: ${err.message}`);
    });

    return NextResponse.json({ jobId: job.id, status: job.status }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[admin/channels/[id]/carousels] POST error:', msg, error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
