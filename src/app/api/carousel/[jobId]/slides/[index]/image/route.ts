import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/carousel/[jobId]/slides/[index]/image
 * Returns the slide image as a PNG binary response.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string; index: string }> },
) {
  try {
    const { jobId, index } = await params;
    const slideIndex = parseInt(index, 10);

    if (isNaN(slideIndex) || slideIndex < 0) {
      return NextResponse.json({ error: 'Invalid slide index' }, { status: 400 });
    }

    const slide = await prisma.carouselSlide.findUnique({
      where: {
        carouselJobId_slideIndex: { carouselJobId: jobId, slideIndex },
      },
      select: { imageUrl: true },
    });

    if (!slide) {
      return NextResponse.json({ error: 'Slide not found' }, { status: 404 });
    }

    if (!slide.imageUrl) {
      return NextResponse.json({ error: 'Slide has no image' }, { status: 404 });
    }

    // imageUrl is a base64 data URI: "data:image/png;base64,..."
    const match = slide.imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: 'Invalid image format' }, { status: 500 });
    }

    const [, format, base64Data] = match;
    const buffer = Buffer.from(base64Data, 'base64');

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': `image/${format}`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[api/carousel/slides/image] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
