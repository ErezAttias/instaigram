import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/instagram/callback
 * Handles the OAuth callback from Instagram (new Instagram Login API).
 * Exchanges the code for a long-lived token and stores credentials on the Channel.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const channelId = searchParams.get('state');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  if (error || !code || !channelId) {
    return NextResponse.redirect(
      `${appUrl}/admin/channels/${channelId ?? ''}?instagram=error&reason=${encodeURIComponent(error ?? 'missing_code')}`
    );
  }

  const appId = process.env.INSTAGRAM_APP_ID!;
  const appSecret = process.env.INSTAGRAM_APP_SECRET!;
  const redirectUri = `${appUrl}/api/instagram/callback`;

  try {
    // Step 1: Exchange code for short-lived token
    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(`Token exchange failed: ${tokenData.error_message ?? JSON.stringify(tokenData)}`);
    }
    const shortToken = tokenData.access_token as string;
    const igUserId = String(tokenData.user_id);

    // Step 2: Exchange for long-lived token (valid ~60 days)
    const longTokenUrl = new URL('https://graph.instagram.com/access_token');
    longTokenUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longTokenUrl.searchParams.set('client_id', appId);
    longTokenUrl.searchParams.set('client_secret', appSecret);
    longTokenUrl.searchParams.set('access_token', shortToken);

    const longTokenRes = await fetch(longTokenUrl.toString());
    const longTokenData = await longTokenRes.json();
    if (!longTokenRes.ok || !longTokenData.access_token) {
      throw new Error(`Long-lived token exchange failed: ${longTokenData.error?.message ?? JSON.stringify(longTokenData)}`);
    }
    const longToken = longTokenData.access_token as string;
    const expiresIn = (longTokenData.expires_in as number) ?? 5183944; // ~60 days
    const tokenExpiry = new Date(Date.now() + expiresIn * 1000);

    // Step 3: Get Instagram username
    const meRes = await fetch(
      `https://graph.instagram.com/me?fields=user_id,username&access_token=${longToken}`
    );
    const meData = await meRes.json();
    const username = (meData.username as string | undefined) ?? '';

    // Step 4: Persist on Channel
    await prisma.channel.update({
      where: { id: channelId },
      data: {
        instagramUserId: igUserId,
        instagramUsername: username,
        instagramAccessToken: longToken,
        instagramTokenExpiry: tokenExpiry,
      },
    });

    return NextResponse.redirect(
      `${appUrl}/admin/channels/${channelId}?instagram=connected`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[instagram/callback]', message);
    return NextResponse.redirect(
      `${appUrl}/admin/channels/${channelId}?instagram=error&reason=${encodeURIComponent(message)}`
    );
  }
}
