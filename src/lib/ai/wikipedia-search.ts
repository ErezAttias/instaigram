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
  width?: number;
  height?: number;
  mime?: string;
  thumburl?: string;
  extmetadata?: {
    Artist?: { value: string };
    LicenseShortName?: { value: string };
    LicenseUrl?: { value: string };
    Credit?: { value: string };
    ImageDescription?: { value: string };
    ObjectName?: { value: string };
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
  /** Full-resolution file URL from Commons. Much larger than the REST summary
   *  thumbnail (which is often only 320px wide). */
  fullUrl: string | null;
}> {
  // Extract filename from the URL (e.g. ".../commons/thumb/1/1a/Foo.jpg/…" or ".../commons/1/1a/Foo.jpg")
  const match = imageUrl.match(/\/([^/]+\.(?:jpg|jpeg|png|svg|gif|webp))(?:\/|$)/i);
  if (!match) return { author: null, license: null, commonsFileUrl: null, fullUrl: null };
  const filename = decodeURIComponent(match[1]);

  // iiurlwidth=2160 asks Commons for a 2160px-wide scaled JPG — 2× the slide
  // canvas width (1080px) so the cover-crop step doesn't need to upscale and
  // Retina displays render the final slide crisp. Commons caps at the file's
  // own resolution, so if the original is smaller we just get the original.
  const url = `${COMMONS_API_BASE}?action=query&titles=${encodeURIComponent('File:' + filename)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=2160&format=json&origin=*`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { author: null, license: null, commonsFileUrl: null, fullUrl: null };
    const data = (await res.json()) as {
      query?: { pages?: Record<string, { imageinfo?: CommonsImageInfo[] }> };
    };
    const page = Object.values(data.query?.pages ?? {})[0];
    const info = page?.imageinfo?.[0] as (CommonsImageInfo & { thumburl?: string; url?: string }) | undefined;
    if (!info) return { author: null, license: null, commonsFileUrl: null, fullUrl: null };
    // Prefer the scaled thumburl (served by Wikimedia's image scaler) over the
    // raw originals, which can be 20MB+ TIFFs for featured photos.
    const fullUrl = info.thumburl ?? info.url ?? null;
    return {
      author: stripHtml(info.extmetadata?.Artist?.value ?? info.extmetadata?.Credit?.value ?? null),
      license: info.extmetadata?.LicenseShortName?.value ?? null,
      commonsFileUrl: info.descriptionurl ?? null,
      fullUrl,
    };
  } catch {
    return { author: null, license: null, commonsFileUrl: null, fullUrl: null };
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
  const summaryImage = summary.originalimage?.source ?? summary.thumbnail?.source;
  if (!summaryImage) return null;

  const sourceUrl =
    summary.content_urls?.desktop?.page ??
    `https://en.wikipedia.org/wiki/${encodeURIComponent(summary.title)}`;

  const { author, license, commonsFileUrl, fullUrl } = await fetchImageMetadata(summaryImage);

  // Prefer the Commons-scaled 1600px URL over the REST summary thumbnail
  // (which caps around 320px) whenever Commons gave us one.
  const imageUrl = fullUrl ?? summaryImage;

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

/**
 * Search Commons File namespace directly for photos matching `query`. This is
 * the high-signal source for well-photographed subjects (people, places,
 * animals) because Commons is a curated photo library — unlike an article's
 * image list, which is biased toward contextual photos (birthplaces, stadia,
 * architecture) rather than the subject itself.
 */
async function commonsFileSearch(query: string, limit: number): Promise<WikipediaSearchResult[]> {
  const search = `filetype:bitmap ${query}`;
  const url = `${COMMONS_API_BASE}?action=query&generator=search&gsrsearch=${encodeURIComponent(search)}&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=2160&format=json&origin=*`;
  let data: {
    query?: {
      pages?: Record<string, {
        title?: string;
        imageinfo?: (CommonsImageInfo & { thumburl?: string })[];
      }>;
    };
  } = {};
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    data = await res.json();
  } catch {
    return [];
  }

  const rejectFilename = /(icon|logo|flag[^a-z]|symbol|disambig|commons-logo|edit-icon|wiki[-_]?logo|arrow|question_mark|red_pencil)/i;
  const out: WikipediaSearchResult[] = [];
  for (const page of Object.values(data.query?.pages ?? {})) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const mime = info.mime ?? '';
    if (!mime.startsWith('image/') || mime === 'image/svg+xml') continue;
    const w = info.width ?? 0;
    const h = info.height ?? 0;
    if (w < 400 || h < 400) continue;
    const pageTitle = page.title ?? '';
    if (rejectFilename.test(pageTitle)) continue;
    const imageUrl = info.thumburl ?? info.url;
    if (!imageUrl) continue;

    out.push({
      imageUrl,
      sourceUrl: info.descriptionurl ?? '',
      pageTitle: pageTitle.replace(/^File:/, '').replace(/\.\w+$/, ''),
      pageDescription: stripHtml(info.extmetadata?.ImageDescription?.value ?? null),
      author: stripHtml(info.extmetadata?.Artist?.value ?? info.extmetadata?.Credit?.value ?? null),
      license: info.extmetadata?.LicenseShortName?.value ?? null,
      commonsFileUrl: info.descriptionurl ?? null,
    });
  }
  return out;
}

/**
 * Gallery variant — returns up to `limit` images for `query`. Merges three
 * sources so subjects without good article imagery (notably celebrities whose
 * Wikipedia page has a non-free fair-use portrait) still get real photos:
 *
 *   1. Summary lead image (the article's infobox photo).
 *   2. Commons File:-namespace search — curated photo library tagged with
 *      the subject. Where the best portraits/action shots live.
 *   3. Article image list via `generator=images` — useful for places/things
 *      but noisy for people (often returns birthplaces, stadia, logos).
 *
 * Results are de-duped by URL so the lead image isn't shown twice.
 */
export async function searchWikipediaImages(
  query: string,
  limit = 9,
): Promise<WikipediaSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  let summary = await fetchSummary(trimmed);
  const needsFallback =
    !summary ||
    summary.type === 'disambiguation' ||
    (!summary.originalimage && !summary.thumbnail);
  if (needsFallback) {
    const corrected = await openSearchTitle(trimmed);
    if (corrected && corrected !== trimmed) summary = await fetchSummary(corrected);
  }

  const title = summary?.title ?? trimmed;
  const sourceUrl = summary?.content_urls?.desktop?.page
    ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
  const pageDescription = summary?.description ?? null;

  // 1 — Lead image (article infobox). Always first if present.
  const leadResults: WikipediaSearchResult[] = [];
  if (summary) {
    const lead = await searchWikipediaImage(trimmed);
    if (lead) leadResults.push(lead);
  }

  // 2 + 3 — Commons search and article image list in parallel.
  const [commonsResults, articleResults] = await Promise.all([
    commonsFileSearch(trimmed, Math.max(limit, 12)),
    (async () => {
      if (!summary) return [] as WikipediaSearchResult[];
      const url = `${WIKIPEDIA_ACTION_API}?action=query&titles=${encodeURIComponent(title)}&generator=images&gimlimit=30&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=2160&format=json&origin=*`;
      try {
        const res = await fetchWithTimeout(url);
        if (!res.ok) return [];
        const data = await res.json() as {
          query?: { pages?: Record<string, { title?: string; imageinfo?: (CommonsImageInfo & { thumburl?: string })[] }> };
        };
        const rejectFilename = /(icon|logo|flag[^a-z]|symbol|disambig|commons-logo|edit-icon|wiki[-_]?logo|arrow|question_mark|red_pencil)/i;
        const pages = Object.values(data.query?.pages ?? {});
        const out: WikipediaSearchResult[] = [];
        for (const page of pages) {
          const info = page.imageinfo?.[0];
          if (!info) continue;
          const mime = info.mime ?? '';
          if (!mime.startsWith('image/') || mime === 'image/svg+xml') continue;
          const w = info.width ?? 0;
          const h = info.height ?? 0;
          if (w < 320 || h < 320) continue;
          const pageTitle = page.title ?? '';
          if (rejectFilename.test(pageTitle)) continue;
          const imageUrl = info.thumburl ?? info.url;
          if (!imageUrl) continue;
          out.push({
            imageUrl,
            sourceUrl,
            pageTitle: title,
            pageDescription,
            author: stripHtml(info.extmetadata?.Artist?.value ?? info.extmetadata?.Credit?.value ?? null),
            license: info.extmetadata?.LicenseShortName?.value ?? null,
            commonsFileUrl: info.descriptionurl ?? null,
          });
        }
        return out;
      } catch {
        return [];
      }
    })(),
  ]);

  // De-dupe by URL, preserving priority: lead → commons → article.
  const seen = new Set<string>();
  const merged: WikipediaSearchResult[] = [];
  for (const r of [...leadResults, ...commonsResults, ...articleResults]) {
    if (seen.has(r.imageUrl)) continue;
    seen.add(r.imageUrl);
    merged.push(r);
    if (merged.length >= limit) break;
  }

  if (merged.length === 0) {
    const lead = await searchWikipediaImage(trimmed);
    return lead ? [lead] : [];
  }

  return merged;
}
