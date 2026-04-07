import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/instagram/auth?channelId=xxx
 * Redirects the user to the Instagram OAuth dialog (new Instagram Login API).
 */
export async function GET(request: NextRequest) {
  const channelId = request.nextUrl.searchParams.get('channelId');
  if (!channelId) {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
  }

  const appId = process.env.INSTAGRAM_APP_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appId || !appUrl) {
    return NextResponse.json(
      { error: 'Instagram app is not configured. Set INSTAGRAM_APP_ID and NEXT_PUBLIC_APP_URL.' },
      { status: 500 }
    );
  }

  const redirectUri = `${appUrl}/api/instagram/callback`;
  const scope = 'instagram_business_basic,instagram_content_publish';

  const oauthUrl = new URL('https://www.instagram.com/oauth/authorize');
  oauthUrl.searchParams.set('client_id', appId);
  oauthUrl.searchParams.set('redirect_uri', redirectUri);
  oauthUrl.searchParams.set('response_type', 'code');
  oauthUrl.searchParams.set('scope', scope);
  oauthUrl.searchParams.set('state', channelId);

  return NextResponse.redirect(oauthUrl.toString());
}
