import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { publishCarouselToInstagram } from '@/lib/services/instagram-service';

/**
 * POST /api/carousel/[jobId]/publish
 * Publishes an approved carousel to the channel's connected Instagram account.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  try {
    const job = await prisma.carouselJob.findUnique({ where: { id: jobId } });
    if (!job) {
      return NextResponse.json({ error: 'Carousel not found' }, { status: 404 });
    }
    if (!job.approved) {
      return NextResponse.json(
        { error: 'Carousel must be approved before publishing' },
        { status: 400 }
      );
    }
    if (!job.channelId) {
      return NextResponse.json(
        { error: 'Carousel is not associated with a channel' },
        { status: 400 }
      );
    }

    const channel = await prisma.channel.findUnique({ where: { id: job.channelId } });
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }
    if (!channel.instagramAccessToken || !channel.instagramUserId) {
      return NextResponse.json(
        { error: 'no_instagram', message: 'No Instagram account connected to this channel' },
        { status: 400 }
      );
    }
    if (
      channel.instagramTokenExpiry &&
      new Date(channel.instagramTokenExpiry) < new Date()
    ) {
      return NextResponse.json(
        { error: 'token_expired', message: 'Instagram token has expired — please reconnect your account' },
        { status: 400 }
      );
    }

    const { mediaId } = await publishCarouselToInstagram(jobId, channel);
    return NextResponse.json({ success: true, mediaId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[carousel/publish]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
