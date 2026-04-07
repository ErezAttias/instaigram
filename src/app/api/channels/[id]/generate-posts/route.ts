import { NextResponse } from 'next/server';
import { generateChannelPostsBatch, type ChannelPostStreamEvent } from '@/lib/services/channel-carousel-bridge';
import { handleApiError, buildDebugMeta } from '@/lib/utils/api-helpers';

/**
 * POST /api/channels/:id/generate-posts
 *
 * Generates posts using the full carousel pipeline.
 * Delegates to the same channel-carousel-bridge as generate-posts-batch.
 *
 * Two modes:
 * 1. SSE streaming (Accept: text/event-stream) — emits post_start/post_complete events
 * 2. Regular JSON (default) — blocking, returns summary
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const accept = request.headers.get('accept') || '';

  const batchSize = 3;

  if (accept.includes('text/event-stream')) {
    return handleStreaming(id, batchSize);
  }

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
