import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { renderOpenerSlide } from '@/lib/visual/renderer';
import { renderFactSlide } from '@/lib/visual/fact-slide-renderer';
import { buildSlidePrompt } from '@/lib/visual/prompt-builder';
import { getImageProviderForTopic, createCarouselSession } from '@/lib/ai/image-provider';

/**
 * POST /api/posts/[id]/render — Render all slides of a post as visual images.
 * Returns an array of { slideIndex, imageUrl } for each rendered slide.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: postId } = await params;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        slides: { orderBy: { slideIndex: 'asc' } },
        channel: true,
      },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const topic = post.channel?.niche || post.channel?.name || post.title;
    const imageProvider = getImageProviderForTopic(topic);
    const session = createCarouselSession(imageProvider);

    const results: Array<{ slideIndex: number; imageUrl: string | null; error?: string }> = [];

    for (const slide of post.slides) {
      const displayTitle = slide.displayTitle || slide.headline || slide.text.slice(0, 80);
      const displaySupport = slide.displaySupport || '';

      try {
        let imageBase64: string | null = null;

        if (slide.role === 'OPENER' || slide.role === 'HOOK') {
          const result = await renderOpenerSlide(
            {
              slideRole: 'HOOK',
              displayTitle,
              displaySupport,
              subject: slide.topicEntity || topic,
            },
            session,
          );
          if (result.image) {
            imageBase64 = result.image.toString('base64');
          }
        } else if (slide.role === 'FACT' || slide.role === 'IMPLICATION' ||
                   slide.role === 'SETUP' || slide.role === 'BUILD' ||
                   slide.role === 'TWIST' || slide.role === 'INSIGHT') {
          const promptOutput = buildSlidePrompt({
            slideRole: slide.role === 'FACT' || slide.role === 'IMPLICATION' ? slide.role : 'BUILD',
            subject: slide.topicEntity || topic,
            topic,
            headlineText: displayTitle,
            bodyText: displaySupport,
          });

          const result = await renderFactSlide(
            {
              imagePrompt: promptOutput.imagePrompt,
              slideType: 'fact',
              displayTitle,
              displaySupport,
              textZone: 'bottom_right',
              slideRole: slide.role,
            },
            session,
          );
          if (result.image) {
            imageBase64 = result.image.toString('base64');
          }
        }
        // CTA slides: render as opener-style
        else if (slide.role === 'CTA') {
          const result = await renderOpenerSlide(
            {
              slideRole: 'CTA',
              displayTitle,
              displaySupport,
              subject: topic,
            },
            session,
          );
          if (result.image) {
            imageBase64 = result.image.toString('base64');
          }
        }

        results.push({
          slideIndex: slide.slideIndex,
          imageUrl: imageBase64 ? `data:image/png;base64,${imageBase64}` : null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[render] Slide ${slide.slideIndex} failed: ${msg}`);
        results.push({
          slideIndex: slide.slideIndex,
          imageUrl: null,
          error: msg.slice(0, 200),
        });
      }
    }

    return NextResponse.json({ postId, slides: results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[api/posts/render] Error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
