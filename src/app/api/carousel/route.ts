import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { prisma } from '@/lib/db/prisma';
import { createCarouselJob, runCarouselGeneration } from '@/lib/services/standalone-carousel-service';

// On Vercel, functions are torn down when the response returns unless we
// explicitly extend the lifetime. `maxDuration` lets the background job run
// up to 5 min (Pro plan ceiling); `waitUntil` below tells Vercel to keep the
// execution context alive for the promise we hand it.
export const maxDuration = 300;

/**
 * Neon serverless Postgres auto-suspends on idle; the first request after a
 * suspend can fail with "Control plane request failed" before the compute
 * resumes. A single short retry catches that transient and prevents a
 * cold-start blip from surfacing as a user-visible failure.
 */
async function withDbRetry<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isControlPlane =
      msg.includes('Control plane request failed') ||
      msg.includes('DriverAdapterError') ||
      (err instanceof Error && err.name === 'DriverAdapterError');
    if (!isControlPlane) throw err;
    console.warn(`[api/carousel] DB control-plane blip, retrying once: ${msg.slice(0, 120)}`);
    await new Promise(r => setTimeout(r, 300));
    return op();
  }
}

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
    const boardProvider: 'openai' | 'gemini' | undefined =
      body.provider === 'gemini' || body.provider === 'openai' ? body.provider : undefined;
    // feat/baked-text-carousel branch: default new carousels to BAKED so
    // gpt-image-1 renders text + scene in one shot. Flip back to 'BOLD' to
    // keep behaviour identical to main.
    const layout = 'BAKED' as const;

    // Dedupe: if the same channel+topic was just submitted in the last 10s
    // and is still in-progress, return the existing job instead of starting
    // a duplicate 5-min generation.
    if (channelId) {
      const recent = await withDbRetry(() => prisma.carouselJob.findFirst({
        where: {
          channelId,
          topic,
          createdAt: { gt: new Date(Date.now() - 10_000) },
          status: { in: ['PENDING', 'GENERATING', 'RENDERING'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true },
      }));
      if (recent) {
        return NextResponse.json({ jobId: recent.id, status: recent.status, deduped: true }, { status: 200 });
      }
    }

    // Pass topic as exactSubject to skip the concept selection LLM call
    const exactSubject = skipImages ? topic : undefined;
    const job = await withDbRetry(() =>
      createCarouselJob(topic, direction, channelId, undefined, exactSubject, layout, boardProvider)
    );

    // Start generation in background (non-blocking). waitUntil keeps the
    // serverless execution context alive after we return the response so
    // the promise actually finishes in prod instead of being killed.
    waitUntil(
      runCarouselGeneration(job.id, undefined, { skipImages, boardProvider }).catch(err => {
        console.error(`[api/carousel] Background generation failed for ${job.id}: ${err.message}`);
      })
    );

    return NextResponse.json({ jobId: job.id, status: job.status }, { status: 201 });
  } catch (error) {
    console.error(`[api/carousel] POST error:`, error);
    return NextResponse.json({ error: 'GENERATION_FAILED' }, { status: 500 });
  }
}
