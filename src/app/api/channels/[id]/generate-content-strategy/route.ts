import { NextResponse } from 'next/server';
import { generateContentStrategyOptions } from '@/lib/services/content-strategy-service';
import { handleApiError, buildDebugMeta } from '@/lib/utils/api-helpers';
import { prisma } from '@/lib/db/prisma';

/**
 * POST /api/channels/:id/generate-content-strategy
 *
 * Generates 3 complementary content pillars for the channel.
 * Returns strategies + shared channelTone and channelAudience.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const channel = await prisma.channel.findUnique({ where: { id } });
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    const topic = channel.niche || channel.exploreTopic || 'general';
    const { strategies, channelTone, channelAudience } = await generateContentStrategyOptions(topic);

    return NextResponse.json({ strategies, channelTone, channelAudience, _debug: buildDebugMeta() }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
