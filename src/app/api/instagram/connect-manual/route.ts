import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * POST /api/instagram/connect-manual
 * Saves a manually obtained Instagram access token to a channel.
 * Verifies the token works by fetching the user's profile before saving.
 */
export async function POST(request: NextRequest) {
  try {
    const { channelId, accessToken, userId } = await request.json();

    if (!channelId || !accessToken || !userId) {
      return NextResponse.json({ error: 'channelId, accessToken, and userId are required' }, { status: 400 });
    }

    // Verify the token works and fetch username
    const meRes = await fetch(
      `https://graph.instagram.com/me?fields=user_id,username&access_token=${accessToken}`
    );
    const meData = await meRes.json();
    if (!meRes.ok) {
      return NextResponse.json(
        { error: `Token verification failed: ${meData.error?.message ?? 'Invalid token'}` },
        { status: 400 }
      );
    }
    const username = (meData.username as string | undefined) ?? userId;

    // Long-lived tokens from the dashboard are already ~60 days; set expiry accordingly
    const tokenExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days

    await prisma.channel.update({
      where: { id: channelId },
      data: {
        instagramUserId: String(userId),
        instagramUsername: username,
        instagramAccessToken: accessToken,
        instagramTokenExpiry: tokenExpiry,
      },
    });

    return NextResponse.json({ success: true, username, tokenExpiry });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[instagram/connect-manual]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
