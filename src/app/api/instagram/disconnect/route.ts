import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * POST /api/instagram/disconnect?channelId=xxx
 * Removes the Instagram account connection from a channel.
 */
export async function POST(request: NextRequest) {
  const channelId = request.nextUrl.searchParams.get('channelId');
  if (!channelId) {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
  }

  await prisma.channel.update({
    where: { id: channelId },
    data: {
      instagramUserId: null,
      instagramUsername: null,
      instagramAccessToken: null,
      instagramTokenExpiry: null,
    },
  });

  return NextResponse.json({ success: true });
}
