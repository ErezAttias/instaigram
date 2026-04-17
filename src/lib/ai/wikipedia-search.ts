/**
 * Wikipedia Search Service
 *
 * General-purpose "query → single image" lookup for the ImagePreviewStep UI.
 * Differs from `wikipedia-image-provider.ts`, which is tuned for celebrity
 * portraits (filtering filenames, excluding logos/flags, etc.). This module
 * accepts any user-typed query (an animal, place, object, person, event…)
 * and returns one image with attribution metadata for display in the picker.
 *
 * The search pipeline:
 *   1. REST summary lookup (`/page/summary/:title`) — fast path for exact matches.
 *   2. OpenSearch fallback on 404 / disambiguation / no-image.
 *   3. Commons imageinfo call with `extmetadata` for author + license.
 */
const WIKIPEDIA_REST_BASE = 'https://en.wikipedia.org/api/rest_v1/page';
const WIKIPEDIA_ACTION_API = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API_BASE = 'https://commons.wikimedia.org/w/api.php';
const REQUEST_TIMEOUT_MS = 12_000;
const USER_AGENT = 'InstAIgram/1.0 (https://instaigram.example.com; contact@instaigram.example.com)';

export interface WikipediaSearchResult {
  /** Direct URL to the full-size image file on Wikimedia Commons. */
  imageUrl: string;
  /** URL of the Wikipedia article the image came from (for user reference). */
  sourceUrl: string;
  /** Resolved article title (after disambiguation/correction). */
  pageTitle: string;
  /** Short snippet describing the article (from the REST summary). */
  pageDescription: string | null;
  /** Author / photographer credit, when Commons provides it. May contain HTML. */
  author: string | null;
  /** License short name (e.g. "CC BY-SA 4.0") when Commons provides it. */
  license: string | null;
  /** Direct link to the Commons file page, for users who want to verify license. */
  commonsFileUrl: string | null;
}

interface WikipediaSummary {
  type?: string;
  title: string;
  description?: string;
  extract?: string;
  thumbnail?: { source: string; width: number; height: number };
  originalimage?: { source: string; width: number; height: number };
  content_urls?: { desktop?: { page?: string } };
}

interface CommonsImageInfo {
  url: string;
  descriptionurl?: string;
  extmetadata?: {
    Artist?: { value: string };
    LicenseShortName?: { value: string };
    LicenseUrl?: { value: string };
    Credit?: { value: string };
  };
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSummary(title: string): Promise<WikipediaSummary | null> {
  const url = `${WIKIPEDIA_REST_BASE}/summary/${encodeURIComponent(title)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  return (await res.json()) as WikipediaSummary;
}

/**
 * Use Wikipedia's OpenSearch API to find the best-matching article title
 * for a free-form query. Returns null if no reasonable match.
 */
async function openSearchTitle(query: string): Promise<string | null> {
  const url = `${WIKIPEDIA_ACTION_API}?action=opensearch&search=${encodeURIComponent(query)}&limit=3&format=json&origin=*`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  // OpenSearch returns [query, [titles], [descriptions], [urls]]
  const data = (await res.json()) as [string, string[]];
  return data[1]?.[0] ?? null;
}

/**
 * Fetch the extmetadata (author, license) for a given image URL by resolving
 * its File: page title and calling Commons imageinfo.
 */
async function fetchImageMetadata(imageUrl: string): Promise<{
  author: string | null;
  license: string | null;
  commonsFileUrl: string | null;
}> {
  // Extract filename from the URL (e.g. ".../commons/thumb/1/1a/Foo.jpg/…" or ".../commons/1/1a/Foo.jpg")
  const match = imageUrl.match(/\/([^/]+\.(?:jpg|jpeg|png|svg|gif|webp))(?:\/|$)/i);
  if (!match) return { author: null, license: null, commonsFileUrl: null };
  const filename = decodeURIComponent(match[1]);

  const url = `${COMMONS_API_BASE}?action=query&titles=${encodeURIComponent('File:' + filename)}&prop=imageinfo&iiprop=url|extmetadata&format=json&origin=*`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { author: null, license: null, commonsFileUrl: null };
    const data = (await res.json()) as {
      query?: { pages?: Record<string, { imageinfo?: CommonsImageInfo[] }> };
    };
    const page = Object.values(data.query?.pages ?? {})[0];
    const info = page?.imageinfo?.[0];
    if (!info) return { author: null, license: null, commonsFileUrl: null };
    return {
      author: stripHtml(info.extmetadata?.Artist?.value ?? info.extmetadata?.Credit?.value ?? null),
      license: info.extmetadata?.LicenseShortName?.value ?? null,
      commonsFileUrl: info.descriptionurl ?? null,
    };
  } catch {
    return { author: null, license: null, commonsFileUrl: null };
  }
}

/**
 * Strip HTML tags from Commons metadata strings (Artist/Credit often come back
 * wrapped in <a>...</a>). Keep it simple — no full-blown HTML parser needed.
 */
function stripHtml(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

/**
 * Resolve a user query to a single Wikipedia image with attribution.
 * Returns null when no suitable image can be found.
 */
export async function searchWikipediaImage(query: string): Promise<WikipediaSearchResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  // 1 — Try the direct REST summary. This succeeds for cleanly-formed queries
  // ("Mantis shrimp", "Eiffel Tower") without an extra round-trip.
  let summary = await fetchSummary(trimmed);

  // 2 — Fall back to OpenSearch if direct lookup failed, was a disambiguation,
  // or returned an article with no image (uncommon but possible for stubs).
  const needsFallback =
    !summary ||
    summary.type === 'disambiguation' ||
    (!summary.originalimage && !summary.thumbnail);

  if (needsFallback) {
    const corrected = await openSearchTitle(trimmed);
    if (corrected && corrected !== trimmed) {
      summary = await fetchSummary(corrected);
    }
  }

  if (!summary) return null;
  const imageUrl = summary.originalimage?.source ?? summary.thumbnail?.source;
  if (!imageUrl) return null;

  const sourceUrl =
    summary.content_urls?.desktop?.page ??
    `https://en.wikipedia.org/wiki/${encodeURIComponent(summary.title)}`;

  const { author, license, commonsFileUrl } = await fetchImageMetadata(imageUrl);

  return {
    imageUrl,
    sourceUrl,
    pageTitle: summary.title,
    pageDescription: summary.description ?? null,
    author,
    license,
    commonsFileUrl,
  };
}
