/**
 * Wikipedia Image Provider
 *
 * Fetches real photos for a celebrity/public figure from Wikipedia/Wikimedia Commons.
 * Used for OPENER (HOOK) and CTA slides in celebrity carousels.
 *
 * - OPENER: uses the article's primary image (main Wikipedia photo)
 * - CTA: uses the article's secondary image (second photo in the article) so the
 *   two slides show different real photos of the same person
 *
 * Disambiguation: if the bare name resolves to a disambiguation page, retries with
 * known role suffixes (_(musician), _(actor), etc.).
 *
 * Images are CC-licensed (free to use with attribution).
 */

import { logAICall, summarizeInput } from './logger';
import type { AICallMeta } from './logger';
import type { AIResult, ImageGenerationOptions, RawImageProvider } from './types';
import { ProviderFailedError } from './retry';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');

// Target image region dimensions (must match layout-compositor.ts IMAGE_REGION)
const IMAGE_REGION_WIDTH = 1080;
const IMAGE_REGION_HEIGHT = 1030;

// ─── Configuration ───────────────────────────────────────────────

const WIKIPEDIA_REST_BASE = 'https://en.wikipedia.org/api/rest_v1/page';
const COMMONS_API_BASE = 'https://commons.wikimedia.org/w/api.php';
const REQUEST_TIMEOUT_MS = 15_000;

const DISAMBIGUATION_SUFFIXES = [
  '_(band)',
  '_(music)',
  '_(musician)',
  '_(singer)',
  '_(actor)',
  '_(actress)',
  '_(rapper)',
  '_(athlete)',
  '_(entertainer)',
  '_(director)',
  '_(group)',
];

// File names containing these words are skipped — excludes non-portrait content
const SKIP_FILENAME_PATTERNS = /logo|icon|flag|symbol|signature|autograph|award|album|cover|stamp|map|coat|ship|boat|harbour|harbor|dock|street|town|city|building|church|bridge|landscape|skyline|stadium|arena|theatre|theater|house|home|school|university|museum|monument|statue|garden|park|road|railway|train|plane|aircraft|car|vehicle/i;

// ─── Types ───────────────────────────────────────────────────────

interface WikipediaSummary {
  type: string;
  title: string;
  thumbnail?: { source: string; width: number; height: number };
  originalimage?: { source: string; width: number; height: number };
}

// ─── Provider ────────────────────────────────────────────────────

export class WikipediaImageProvider implements RawImageProvider {
  resolveModel(_slideRole?: string): string {
    return 'wikimedia-commons';
  }

  async generateImage(
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<AIResult<Buffer>> {
    const startTime = Date.now();

    // Prefer the explicitly passed subjectName (e.g. carousel topic = "Sting").
    // Fall back to extracting from the prompt prefix (before first comma).
    const personName = options?.subjectName?.trim() || prompt.split(',')[0].trim();
    const isCta = options?.slideRole === 'CTA';
    const excludeUrls = options?.excludeUrls ?? [];

    console.log(
      `[wikipedia] Fetching ${isCta ? 'secondary' : 'primary'} photo for "${personName}" (role: ${options?.slideRole ?? 'unset'})`
    );

    const { buffer, url } = await this.fetchPersonImage(personName, isCta, excludeUrls);

    const meta: AICallMeta = {
      provider: 'wikipedia',
      model: 'wikimedia-commons',
      task: 'generateImage',
      inputSummary: summarizeInput(personName),
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      sourceUrl: url,
    };
    logAICall(meta);

    return { data: buffer, meta };
  }

  private async fetchPersonImage(personName: string, wantSecondary: boolean, excludeUrls: string[] = []): Promise<{ buffer: Buffer; url: string }> {
    // Step 1: resolve article title (handles disambiguation)
    const { summary, articleTitle } = await this.resolveSummary(personName);

    // Step 2a (CTA): try to get a different photo for variety
    const primaryUrl = summary.originalimage?.source ?? summary.thumbnail?.source;
    if (wantSecondary) {
      const secondaryUrl = await this.findSecondaryImageUrl(articleTitle, personName, primaryUrl ?? null, excludeUrls);
      if (secondaryUrl) {
        console.log(`[wikipedia] Using secondary image for CTA: ${secondaryUrl.slice(0, 80)}...`);
        return { buffer: await this.downloadAndCrop(secondaryUrl, personName), url: secondaryUrl };
      }
      console.warn(`[wikipedia] No secondary image found for "${personName}", using primary for CTA`);
    }

    // Step 2b (OPENER or CTA fallback): main article image
    // If primary is in the exclude list, try secondary as a fallback before giving up.
    if (primaryUrl && excludeUrls.includes(primaryUrl)) {
      const secondaryUrl = await this.findSecondaryImageUrl(articleTitle, personName, null, excludeUrls);
      if (secondaryUrl) {
        console.log(`[wikipedia] Primary excluded — using secondary: ${secondaryUrl.slice(0, 80)}...`);
        return { buffer: await this.downloadAndCrop(secondaryUrl, personName), url: secondaryUrl };
      }
      console.warn(`[wikipedia] Primary excluded and no secondary found for "${personName}" — using primary anyway`);
    }

    if (!primaryUrl) {
      throw new ProviderFailedError({
        message: `[wikipedia] No image found for "${personName}" (page: "${summary.title}")`,
        attempts: 1,
        provider: 'wikipedia',
        task: 'generateImage',
      });
    }
    return { buffer: await this.downloadAndCrop(primaryUrl, personName), url: primaryUrl };
  }

  /**
   * Resolve a person's name to a Wikipedia article title + summary.
   * Handles:
   *   - Disambiguation pages → retries with known role suffixes
   *   - 404 / typos → uses OpenSearch to find the correct article title
   */
  private async resolveSummary(personName: string): Promise<{ summary: WikipediaSummary; articleTitle: string }> {
    let summary: WikipediaSummary;
    try {
      summary = await this.fetchSummary(personName);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        // Typo or wrong capitalisation — use OpenSearch to correct the title
        const corrected = await this.openSearchCorrect(personName);
        if (corrected && corrected !== personName) {
          console.log(`[wikipedia] OpenSearch corrected "${personName}" → "${corrected}"`);
          summary = await this.fetchSummary(corrected);
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    if (summary.type !== 'disambiguation') {
      return { summary, articleTitle: summary.title };
    }

    console.log(`[wikipedia] "${personName}" is a disambiguation page, trying suffixes...`);
    for (const suffix of DISAMBIGUATION_SUFFIXES) {
      const candidate = `${summary.title}${suffix}`;
      try {
        const s = await this.fetchSummary(candidate);
        if (s.type !== 'disambiguation') {
          console.log(`[wikipedia] Resolved "${personName}" → "${candidate}"`);
          return { summary: s, articleTitle: s.title };
        }
      } catch {
        // suffix didn't resolve — try next
      }
    }

    throw new ProviderFailedError({
      message: `[wikipedia] Could not resolve "${personName}" — all disambiguation suffixes failed`,
      attempts: DISAMBIGUATION_SUFFIXES.length + 1,
      provider: 'wikipedia',
      task: 'generateImage',
    });
  }

  /**
   * Use Wikipedia's OpenSearch API to find the best-matching article title.
   * Handles typos and non-standard capitalisation (e.g. "MIchael Jackson" → "Michael Jackson").
   */
  private async openSearchCorrect(personName: string): Promise<string | null> {
    const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(personName)}&limit=1&format=json&origin=*`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': 'InstAIgram/1.0', 'Accept': 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) return null;
    // OpenSearch returns [query, [titles], [descriptions], [urls]]
    const data = await response.json() as [string, string[]];
    return data[1]?.[0] ?? null;
  }

  /**
   * Find a secondary image URL for the CTA slide via Wikimedia Commons search.
   *
   * Uses the resolved article title (e.g. "Sting (musician)") as a specific
   * query ("Sting musician"). This reliably returns photos OF the person rather
   * than contextual photos in their article (ships, buildings, maps, etc.).
   */
  private async findSecondaryImageUrl(
    articleTitle: string,
    personName: string,
    primaryImageUrl: string | null,
    excludeUrls: string[] = [],
  ): Promise<string | null> {
    // "Sting (musician)" → "Sting musician"
    const commonsQuery = articleTitle.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();

    // Filename must contain at least one word from the person's base name.
    // Strip disambiguation suffixes like "(band)", "(musician)" first —
    // otherwise "band" becomes a name word and matches any band's photos.
    const nameWords = personName
      .replace(/\s*\([^)]*\)/g, '')  // strip "(band)", "(musician)", etc.
      .split(/\s+/)
      .filter(w => w.length > 2)
      .map(w => w.toLowerCase());

    try {
      const searchQuery = encodeURIComponent(commonsQuery);
      const url = `${COMMONS_API_BASE}?action=query&generator=search&gsrsearch=${searchQuery}&gsrnamespace=6&prop=imageinfo&iiprop=url|mime|size&iilimit=1&format=json&gsrlimit=20&origin=*`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { 'User-Agent': 'InstAIgram/1.0', 'Accept': 'application/json' },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (response.ok) {
        const data = await response.json() as {
          query?: { pages?: Record<string, {
            title: string;
            imageinfo?: Array<{ url: string; mime: string; width?: number; height?: number }>;
          }> };
        };
        const pages = Object.values(data.query?.pages ?? {});
        for (const page of pages) {
          const title = page.title ?? '';
          const titleLower = title.toLowerCase();

          if (!/\.(jpg|jpeg|png)$/i.test(title)) continue;
          if (SKIP_FILENAME_PATTERNS.test(title)) continue;

          // Filename must contain at least one word from the person's name
          if (!nameWords.some(w => titleLower.includes(w))) continue;

          const info = page.imageinfo?.[0];
          if (!info?.mime.startsWith('image/')) continue;

          // Minimum 800px wide — filters out low-quality/paparazzi shots
          if ((info.width ?? 0) < 800) continue;

          // Skip the primary image and any already-used URLs from other slides
          if (primaryImageUrl && info.url === primaryImageUrl) continue;
          if (excludeUrls.includes(info.url)) continue;

          console.log(`[wikipedia] Commons found secondary image: ${title} (${info.width}x${info.height})`);
          return info.url;
        }
      }
    } catch {
      // fall through — no secondary found
    }

    return null;
  }

  private async fetchSummary(title: string): Promise<WikipediaSummary> {
    const url = `${WIKIPEDIA_REST_BASE}/summary/${encodeURIComponent(title)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': 'InstAIgram/1.0', 'Accept': 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const err = new Error(`[wikipedia] HTTP ${response.status} for "${title}"`);
      (err as any).status = response.status;
      throw err;
    }

    return response.json() as Promise<WikipediaSummary>;
  }

  private async downloadAndCrop(imgUrl: string, personName: string): Promise<Buffer> {
    console.log(`[wikipedia] Downloading image for "${personName}": ${imgUrl.slice(0, 80)}...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let imgResponse: Response;
    try {
      imgResponse = await fetch(imgUrl, {
        headers: { 'User-Agent': 'InstAIgram/1.0' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!imgResponse.ok) {
      throw new ProviderFailedError({
        message: `[wikipedia] Image download failed (HTTP ${imgResponse.status}) for "${personName}"`,
        httpStatus: imgResponse.status,
        attempts: 1,
        provider: 'wikipedia',
        task: 'generateImage',
      });
    }

    const rawBuffer = Buffer.from(await imgResponse.arrayBuffer());
    console.log(`[wikipedia] Image received for "${personName}": ${Math.round(rawBuffer.length / 1024)}KB`);

    // Pre-crop using 'top' gravity so the face is always visible.
    // The layout compositor uses center-crop; for tall concert/portrait shots
    // this would cut off the head. Anchoring to 'top' keeps the face in frame.
    const buffer: Buffer = await sharp(rawBuffer)
      .resize(IMAGE_REGION_WIDTH, IMAGE_REGION_HEIGHT, { fit: 'cover', position: 'top' })
      .png()
      .toBuffer();

    console.log(`[wikipedia] Pre-cropped to ${IMAGE_REGION_WIDTH}x${IMAGE_REGION_HEIGHT} (top-anchor) for "${personName}"`);
    return buffer;
  }
}

/**
 * Proactively resolve a topic to its Wikipedia entity title.
 *
 * Two-pass strategy:
 *   1. Try each disambiguation suffix — handles ambiguous topics that resolve to
 *      the wrong primary article (e.g. "Oasis" → desert; suffix finds "Oasis (band)").
 *   2. If all suffixes fail, try the bare topic directly — handles bands/people whose
 *      article exists without a suffix (e.g. "Roxette", "The Beatles").
 *      Only accepted if the article has an image (filters out 404s and stub articles).
 *
 * Suffixes-first ensures we never use a wrong primary article when the correct
 * disambiguated one exists.
 *
 * Returns the resolved title or null if neither pass succeeds.
 */
export async function resolveWikipediaConcept(topic: string): Promise<string | null> {
  // Pass 1: disambiguation suffixes (e.g. "Oasis" → "Oasis (band)")
  for (const suffix of DISAMBIGUATION_SUFFIXES) {
    const candidate = `${topic}${suffix}`;
    try {
      const url = `${WIKIPEDIA_REST_BASE}/summary/${encodeURIComponent(candidate)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { 'User-Agent': 'InstAIgram/1.0', 'Accept': 'application/json' },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) continue;
      const data = await response.json() as WikipediaSummary;
      if (data.type === 'standard') {
        const resolved = candidate.replace(/_/g, ' ');
        console.log(`[wikipedia] resolveWikipediaConcept: "${topic}" → "${resolved}"`);
        return resolved;
      }
    } catch {
      // suffix didn't resolve — try next
    }
  }

  // Pass 2: bare topic (e.g. "Roxette" — correct article exists without a suffix)
  try {
    const url = `${WIKIPEDIA_REST_BASE}/summary/${encodeURIComponent(topic)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': 'InstAIgram/1.0', 'Accept': 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (response.ok) {
      const data = await response.json() as WikipediaSummary;
      if (data.type === 'standard' && (data.originalimage || data.thumbnail)) {
        console.log(`[wikipedia] resolveWikipediaConcept: "${topic}" resolves directly → "${data.title}"`);
        return data.title;
      }
    }
  } catch {
    // bare name didn't resolve either
  }

  return null;
}
