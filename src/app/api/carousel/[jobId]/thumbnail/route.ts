import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

type RouteContext = { params: Promise<{ jobId: string }> };

const CAROUSEL_IMAGES_DIR = path.join(process.cwd(), 'public', 'carousel-images');

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { jobId } = await params;

  const slide = await prisma.carouselSlide.findFirst({
    where: { carouselJobId: jobId, slideIndex: 0 },
    select: { imageUrl: true },
  });

  if (!slide?.imageUrl) {
    return new NextResponse(null, { status: 404 });
  }

  // R2 / external URL — redirect directly; browser handles caching
  if (slide.imageUrl.startsWith('https://')) {
    return NextResponse.redirect(slide.imageUrl, { status: 302 });
  }

  // Fast path: local disk
  const cachedPath = path.join(CAROUSEL_IMAGES_DIR, jobId, '0.png');
  if (fs.existsSync(cachedPath)) {
    const buffer = fs.readFileSync(cachedPath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  }

  // Slow path: legacy base64 in DB, cache to disk for next time
  const { buffer, mime } = await resolveImageUrl(slide.imageUrl);
  if (!buffer) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const dir = path.join(CAROUSEL_IMAGES_DIR, jobId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cachedPath, buffer);
  } catch {
    // Non-fatal
  }

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}

export async function resolveImageUrl(
  imageUrl: string,
): Promise<{ buffer: Buffer | null; mime: string }> {
  // R2 / external HTTPS URL
  if (imageUrl.startsWith('https://')) {
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) return { buffer: null, mime: 'image/png' };
      return { buffer: Buffer.from(await res.arrayBuffer()), mime: 'image/png' };
    } catch {
      return { buffer: null, mime: 'image/png' };
    }
  }

  // Local file path: /carousel-images/<jobId>/<index>.png
  if (imageUrl.startsWith('/carousel-images/')) {
    const filePath = path.join(process.cwd(), 'public', imageUrl);
    if (fs.existsSync(filePath)) {
      return { buffer: fs.readFileSync(filePath), mime: 'image/png' };
    }
    return { buffer: null, mime: 'image/png' };
  }

  // Legacy base64 data URI
  const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { buffer: Buffer.from(match[2], 'base64'), mime: match[1] };
  }

  return { buffer: null, mime: 'image/png' };
}
