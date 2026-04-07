import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/carousel/[jobId]/status — SSE stream of generation progress.
 * Polls the DB for progress updates and streams them to the client.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

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

      let lastStep = '';
      let lastReadyCount = -1;
      const maxPolls = 300; // 5 minutes at 1s interval

      for (let i = 0; i < maxPolls && !closed; i++) {
        try {
          const job = await prisma.carouselJob.findUnique({
            where: { id: jobId },
            select: { status: true, progress: true, errorMessage: true },
          });

          if (!job) {
            send({ step: 'error', message: 'Job not found', pct: 0 });
            break;
          }

          // Count slides with images (ready) vs total for progressive rendering
          const slideCounts = await prisma.carouselSlide.groupBy({
            by: ['status'],
            where: { carouselJobId: jobId },
            _count: true,
          });
          const totalSlides = slideCounts.reduce((sum, g) => sum + g._count, 0);
          const readySlides = await prisma.carouselSlide.count({
            where: { carouselJobId: jobId, imageUrl: { not: null } },
          });
          const failedSlides = slideCounts.find(g => g.status === 'FAILED_IMAGE')?._count ?? 0;

          const progress = job.progress as { step?: string; message?: string; pct?: number } | null;
          const currentStep = progress?.step || job.status;

          // Send update if step changed OR slide readiness changed
          if (currentStep !== lastStep || readySlides !== lastReadyCount) {
            send({
              step: progress?.step || job.status.toLowerCase(),
              message: progress?.message || job.status,
              pct: progress?.pct || 0,
              status: job.status,
              slides: { total: totalSlides, ready: readySlides, failed: failedSlides },
            });
            lastStep = currentStep;
            lastReadyCount = readySlides;
          }

          if (job.status === 'COMPLETE' || job.status === 'FAILED') {
            break;
          }
        } catch (err) {
          send({ step: 'error', message: 'Poll error', pct: 0 });
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
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
