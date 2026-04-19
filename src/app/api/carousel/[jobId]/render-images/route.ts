import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { prisma } from '@/lib/db/prisma';
import { runImageStage } from '@/lib/services/standalone-carousel-service';

// Keep the serverless context alive for the full image render. Same reasoning
// as /api/carousel: Vercel kills the context after the response unless told.
export const maxDuration = 300;

interface SlideOverride {
  slideIndex: number;
  source?: 'ai' | 'wikipedia';
  /** User-edited prompt for AI source. */
  prompt?: string;
  /** Picked Wikipedia image URL for Wikipedia source. */
  wikipediaImageUrl?: string;
  /** Search query the user last ran — persisted so we can restore it. */
  wikipediaQuery?: string;
  /** Wikipedia author for CC attribution on the slide. */
  author?: string;
}

/**
 * POST /api/carousel/:jobId/render-images
 *
 * Triggers image rendering. Accepts an optional per-slide override array so
 * the ImagePreviewStep can swap sources, edit prompts, or pick Wikipedia
 * images before rendering. Overrides are persisted to each slide record so
 * the render pipeline picks them up.
 *
 * Body shape (all fields optional):
 *   { slides?: SlideOverride[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  try {
    // Dedupe: if this job is already rendering and was updated recently,
    // skip the re-kick so a double-click doesn't start a 2nd 5-min render.
    const existing = await prisma.carouselJob.findUnique({
      where: { id: jobId },
      select: { status: true, updatedAt: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'JOB_NOT_FOUND' }, { status: 404 });
    }
    const stillFresh = Date.now() - existing.updatedAt.getTime() < 5 * 60 * 1000;
    if (existing.status === 'RENDERING' && stillFresh) {
      return NextResponse.json({ jobId, status: 'RENDERING', deduped: true }, { status: 202 });
    }

    // Body is optional — allow POST with no body (legacy behaviour).
    let overrides: SlideOverride[] = [];
    try {
      const body = await request.json();
      if (Array.isArray(body?.slides)) overrides = body.slides;
    } catch {
      // No body or not JSON — proceed with zero overrides.
    }

    // Persist overrides before kicking off the render so the pipeline can read them back.
    if (overrides.length > 0) {
      await Promise.all(
        overrides.map(o =>
          prisma.carouselSlide.update({
            where: { carouselJobId_slideIndex: { carouselJobId: jobId, slideIndex: o.slideIndex } },
            data: {
              imageSource: o.source ?? undefined,
              imagePromptOverride: o.source === 'ai' ? (o.prompt ?? null) : null,
              imageSourceUrl: o.source === 'wikipedia' ? (o.wikipediaImageUrl ?? null) : null,
              imageAuthor: o.source === 'wikipedia' ? (o.author ?? null) : null,
              wikipediaQuery: o.wikipediaQuery ?? undefined,
            },
          })
        )
      );
    }

    waitUntil(
      runImageStage(jobId).catch(err => {
        console.error(`[render-images] Background rendering failed for ${jobId}: ${err.message}`);
      })
    );

    return NextResponse.json({ jobId, status: 'RENDERING' }, { status: 202 });
  } catch (error) {
    console.error(`[render-images] Error:`, error);
    return NextResponse.json({ error: 'RENDER_FAILED' }, { status: 500 });
  }
}
