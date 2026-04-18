import { prisma } from '@/lib/db/prisma';
import { Channel } from '@/generated/prisma/client';
import { composeSlideForPublish } from '@/lib/services/standalone-carousel-service';

const GRAPH_API = 'https://graph.instagram.com/v21.0';

/**
 * Publishes an approved carousel job to the connected Instagram account.
 * Requires NEXT_PUBLIC_APP_URL to be set — Instagram fetches images from that URL.
 */
export async function publishCarouselToInstagram(
  jobId: string,
  channel: Channel
): Promise<{ mediaId: string }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL is not set');

  if (!channel.instagramUserId || !channel.instagramAccessToken) {
    throw new Error('Channel has no Instagram account connected');
  }

  // Guard: token expiry
  if (
    channel.instagramTokenExpiry &&
    new Date(channel.instagramTokenExpiry) < new Date()
  ) {
    throw new Error('Instagram token has expired — please reconnect your account');
  }

  const job = await prisma.carouselJob.findUnique({
    where: { id: jobId },
    include: { slides: { orderBy: { slideIndex: 'asc' } } },
  });

  if (!job) throw new Error('CarouselJob not found');
  if (!job.approved) throw new Error('Carousel must be approved before publishing');

  const igUserId = channel.instagramUserId;
  const token = channel.instagramAccessToken;

  // Step 1: Create a media container for each slide.
  // The stored slide image is raw (text-free) — preview draws text as a CSS
  // overlay. For Instagram we need a flat PNG, so composite on demand.
  const childIds: string[] = [];
  for (const slide of job.slides) {
    if (!slide.imageUrl) {
      throw new Error(`Slide ${slide.slideIndex} has no image to publish`);
    }
    const flatUrl = await composeSlideForPublish(jobId, slide.slideIndex);
    const imageUrl = flatUrl.startsWith('https://')
      ? flatUrl
      : `${appUrl}${flatUrl.startsWith('/') ? '' : '/'}${flatUrl}`;
    const res = await fetch(`${GRAPH_API}/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        media_type: 'IMAGE',
        is_carousel_item: true,
        access_token: token,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.id) {
      throw new Error(
        `Failed to upload slide ${slide.slideIndex}: ${data.error?.message ?? JSON.stringify(data)}`
      );
    }
    childIds.push(data.id as string);
  }

  // Step 2: Build caption text
  const captionText = buildCaption(job.caption, job.hashtags);

  // Step 3: Create carousel container
  const containerRes = await fetch(`${GRAPH_API}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption: captionText,
      access_token: token,
    }),
  });
  const containerData = await containerRes.json();
  if (!containerRes.ok || !containerData.id) {
    throw new Error(
      `Failed to create carousel container: ${containerData.error?.message ?? JSON.stringify(containerData)}`
    );
  }
  const creationId = containerData.id as string;

  // Step 4: Publish
  const publishRes = await fetch(`${GRAPH_API}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: creationId,
      access_token: token,
    }),
  });
  const publishData = await publishRes.json();
  if (!publishRes.ok || !publishData.id) {
    throw new Error(
      `Failed to publish carousel: ${publishData.error?.message ?? JSON.stringify(publishData)}`
    );
  }
  const mediaId = publishData.id as string;

  // Step 5: Persist published state
  await prisma.carouselJob.update({
    where: { id: jobId },
    data: {
      publishedToInstagram: true,
      instagramMediaId: mediaId,
      instagramPublishedAt: new Date(),
    },
  });

  return { mediaId };
}

/**
 * Refreshes a long-lived Instagram access token (valid for 60 days).
 * Should be called ~10 days before expiry.
 */
export async function refreshInstagramToken(
  token: string
): Promise<{ token: string; expiry: Date }> {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) throw new Error('Instagram app credentials not configured');

  const url = new URL('https://graph.instagram.com/refresh_access_token');
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', token);

  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Token refresh failed: ${data.error?.message ?? JSON.stringify(data)}`);
  }

  const expiry = new Date();
  expiry.setSeconds(expiry.getSeconds() + (data.expires_in as number));
  return { token: data.access_token as string, expiry };
}

function buildCaption(caption: string | null, hashtags: string[]): string {
  const parts: string[] = [];
  if (caption) parts.push(caption);
  if (hashtags.length > 0) {
    parts.push('\n\n' + hashtags.map(h => (h.startsWith('#') ? h : `#${h}`)).join(' '));
  }
  return parts.join('');
}
