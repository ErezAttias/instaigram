import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/admin/channels/[channelId]/batch-orders/[batchOrderId]/status
 * SSE stream of batch order progress. Polls DB every 2 seconds.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string; batchOrderId: string }> },
) {
  const { batchOrderId } = await params;

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      let lastHash = '';
      const maxPolls = 600; // 20 minutes at 2s interval

      for (let i = 0; i < maxPolls && !closed; i++) {
        try {
          const order = await prisma.batchOrder.findUnique({
            where: { id: batchOrderId },
            include: {
              carouselJobs: {
                select: { id: true, topic: true, status: true },
                orderBy: { createdAt: 'asc' },
              },
            },
          });

          if (!order) {
            send({ error: 'Batch order not found' });
            break;
          }

          const progress = order.progress as { currentIndex?: number; currentJobId?: string | null; message?: string } | null;

          const payload = {
            status: order.status,
            size: order.size,
            completed: order.completed,
            failed: order.failed,
            currentIndex: progress?.currentIndex || 0,
            currentJobId: progress?.currentJobId || null,
            message: progress?.message || order.status,
            jobs: order.carouselJobs.map(j => ({
              id: j.id,
              topic: j.topic,
              status: j.status,
            })),
          };

          // Only send if state changed
          const hash = JSON.stringify(payload);
          if (hash !== lastHash) {
            send(payload);
            lastHash = hash;
          }

          if (order.status === 'COMPLETE' || order.status === 'FAILED') {
            break;
          }
        } catch (err) {
          send({ error: 'Poll error' });
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (!closed) {
        try { controller.close(); } catch {}
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
