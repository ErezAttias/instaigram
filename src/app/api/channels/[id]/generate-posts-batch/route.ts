import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { generateChannelPostsBatch, type ChannelPostStreamEvent } from '@/lib/services/channel-carousel-bridge';
import { handleApiError, buildDebugMeta } from '@/lib/utils/api-helpers';

// Full carousel generation (6 slides × ~15s each) needs extended timeout
export const maxDuration = 300;

/**
 * POST /api/channels/:id/generate-posts-batch
 *
 * Generates a batch of posts using the full carousel pipeline
 * (quality gates → image rendering → enforcement).
 * Uses SSE streaming to report progress.
 *
 * Body: { batchSize?: number } (defaults to 3)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const accept = request.headers.get('accept') || '';

  let batchSize = 3;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.batchSize && typeof body.batchSize === 'number') {
      batchSize = Math.min(Math.max(body.batchSize, 1), 10);
    }
  } catch {
    // use default
  }

  // Dedupe: reject if an in-progress carousel job already exists for this
  // channel, started within the last 30s. Prevents double-click from firing
  // a second 5-min batch generation on top of one that's already running.
  const inFlight = await prisma.carouselJob.findFirst({
    where: {
      channelId: id,
      createdAt: { gt: new Date(Date.now() - 30_000) },
      status: { in: ['PENDING', 'GENERATING', 'RENDERING'] },
    },
    select: { id: true },
  });
  if (inFlight) {
    return NextResponse.json(
      { error: 'BATCH_IN_PROGRESS', message: 'A batch generation is already running for this channel.' },
      { status: 409 }
    );
  }

  if (accept.includes('text/event-stream')) {
    try {
      return handleStreaming(id, batchSize);
    } catch (error) {
      console.error('[generate-posts-batch] SSE setup failed:', error);
      return handleApiError(error);
    }
  }

  // Non-streaming fallback
  try {
    const events: ChannelPostStreamEvent[] = [];
    for await (const event of generateChannelPostsBatch(id, batchSize)) {
      events.push(event);
    }
    const completeEvent = events.find(e => e.event === 'complete');
    return NextResponse.json({ ...completeEvent?.data, _debug: buildDebugMeta() }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

function handleStreaming(channelId: string, batchSize: number): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(event: ChannelPostStreamEvent) {
        const data = JSON.stringify(event.data);
        controller.enqueue(encoder.encode(`event: ${event.event}\ndata: ${data}\n\n`));
      }

      try {
        const generator = generateChannelPostsBatch(channelId, batchSize);
        for await (const event of generator) {
          sendEvent(event);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendEvent({ event: 'error', data: { error: message } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
