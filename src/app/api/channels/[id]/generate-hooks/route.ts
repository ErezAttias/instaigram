import { NextResponse } from 'next/server';
import { generateHooks } from '@/lib/services/hook-service';
import { generateHooksStreaming, type HookStreamEvent } from '@/lib/services/hook-service-streaming';
import { handleApiError, buildDebugMeta } from '@/lib/utils/api-helpers';

/**
 * POST /api/channels/:id/generate-hooks
 *
 * Supports two modes:
 * 1. Regular JSON response (default) — full blocking response
 * 2. SSE streaming — set Accept: text/event-stream header
 *    Returns progressive batch events as hooks are generated
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const accept = request.headers.get('accept') || '';

  // ─── SSE streaming mode ──────────────────────────────────────
  if (accept.includes('text/event-stream')) {
    return handleStreaming(id);
  }

  // ─── Regular JSON mode (backward compatible) ─────────────────
  try {
    const posts = await generateHooks(id);
    return NextResponse.json({ ...posts, _debug: buildDebugMeta() }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

function handleStreaming(channelId: string): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(event: HookStreamEvent) {
        const data = JSON.stringify(event.data);
        controller.enqueue(encoder.encode(`event: ${event.event}\ndata: ${data}\n\n`));
      }

      try {
        const generator = generateHooksStreaming(channelId);

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
