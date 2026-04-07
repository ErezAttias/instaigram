import { NextRequest, NextResponse } from 'next/server';
import { getCarouselJob } from '@/lib/services/standalone-carousel-service';

/**
 * GET /api/carousel/[jobId]/export — Export approved carousel as ZIP.
 * Only available after Approve All.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const job = await getCarouselJob(jobId);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (!job.approved) {
      return NextResponse.json(
        { error: 'Carousel must be approved before export. Click Approve All first.' },
        { status: 400 },
      );
    }

    // Block export if any slide is missing its image
    const missingImageSlides = job.slides.filter(s => !s.imageUrl);
    if (missingImageSlides.length > 0) {
      const missing = missingImageSlides.map(s => `slide ${s.slideIndex + 1} (${s.role})`).join(', ');
      return NextResponse.json(
        { error: `Export blocked: ${missing} missing rendered images. Regenerate failed slides first.` },
        { status: 400 },
      );
    }

    // Build ZIP using archiver-compatible approach with raw Blob
    // For MVP, we use a simple approach: concatenate PNGs into a ZIP-like structure
    // Using the built-in compression API
    const { default: archiver } = await import('archiver');
    const { PassThrough } = await import('stream');

    const passThrough = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(passThrough);

    for (const slide of job.slides) {
      if (slide.imageUrl && slide.imageUrl.startsWith('data:image/png;base64,')) {
        const base64Data = slide.imageUrl.replace('data:image/png;base64,', '');
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `slide_${String(slide.slideIndex + 1).padStart(2, '0')}_${slide.role.toLowerCase()}.png`;
        archive.append(buffer, { name: filename });
      }
    }

    await archive.finalize();

    // Collect chunks
    const chunks: Buffer[] = [];
    for await (const chunk of passThrough) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const zipBuffer = Buffer.concat(chunks);

    return new Response(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="carousel_${jobId.slice(0, 8)}.zip"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[api/carousel/export] Error: ${message}`);

    // If archiver is not installed, provide a simpler fallback
    if (message.includes('Cannot find module') || message.includes('archiver')) {
      return NextResponse.json(
        { error: 'Export requires archiver package. Run: npm install archiver @types/archiver' },
        { status: 500 },
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
