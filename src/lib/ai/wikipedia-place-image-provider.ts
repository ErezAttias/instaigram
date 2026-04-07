/**
 * Wikipedia Place Image Provider
 *
 * Fetches real photographs of places (estates, ranches, landmarks, etc.)
 * from Wikimedia Commons. Used for FACT slides where the subject is a
 * real-world location rather than a person.
 *
 * Contrast with WikipediaImageProvider (portrait provider):
 *   - That provider SKIPS location/building images → only returns person photos
 *   - This provider SEEKS location images → only returns place/property photos
 *
 * Images are CC-licensed (free to use with attribution).
 */

import { logAICall, summarizeInput } from './logger';
import type { AICallMeta } from './logger';
import type { AIResult, ImageGenerationOptions, RawImageProvider } from './types';
import { ProviderFailedError } from './retry';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');

const IMAGE_REGION_WIDTH = 1080;
const IMAGE_REGION_HEIGHT = 1030;

const WIKIPEDIA_REST_BASE = 'https://en.wikipedia.org/api/rest_v1/page';
const COMMONS_API_BASE = 'https://commons.wikimedia.org/w/api.php';
const REQUEST_TIMEOUT_MS = 15_000;

const DISAMBIGUATION_SUFFIXES = [
  '_(ranch)',
  '_(estate)',
  '_(property)',
  '_(landmark)',
  '_(building)',
  '_(museum)',
  '_(park)',
];

// Filename patterns that indicate a usable place/location photograph.
// We require at least one of these to be present — excludes portraits,
// logos, diagrams, maps, and other non-location content.
const PLACE_FILENAME_ALLOW = /exterior|aerial|grounds|estate|ranch|property|facade|building|interior|railroad|railway|garden|park|courtyard|landscape|overview|panorama|view|entrance|gate|front|rear|side/i;

// Patterns that disqualify any image regardless of type.
const PLACE_FILENAME_DENY = /logo|icon|flag|symbol|signature|autograph|stamp|map|coat|diagram|chart|plan|blueprint|drawing|sketch|portrait|headshot|mugshot/i;

// ─── Types ───────────────────────────────────────────────────────

interface WikipediaSummary {
  type: string;
  title: string;
  thumbnail?: { source: string; width: number; height: number };
  originalimage?: { source: string; width: number; height: number };
}

// ─── Provider ────────────────────────────────────────────────────

export class WikipediaPlaceImageProvider implements RawImageProvider {
  resolveModel(_slideRole?: string): string {
    return 'wikimedia-commons-place';
  }

  async generateImage(
    prompt: string,
    options?: ImageGenerationOptions,
  ): Promise<AIResult<Buffer>> {
    const startTime = Date.now();

    // Use the explicit subjectName (place name) if provided.
    // Fall back to extracting from the prompt prefix.
    const placeName = options?.subjectName?.trim() || prompt.split(':')[0].trim();

    console.log(`[wikipedia-place] Fetching photo for place "${placeName}"`);

    const buffer = await this.fetchPlaceImage(placeName);

    const meta: AICallMeta = {
      provider: 'wikipedia-place',
      model: 'wikimedia-commons-place',
      task: 'generateImage',
      inputSummary: summarizeInput(placeName),
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
    logAICall(meta);

    return { data: buffer, meta };
  }

  private async fetchPlaceImage(placeName: string): Promise<Buffer> {
    // Step 1: try the article's own primary image
    const { summary, articleTitle } = await this.resolveSummary(placeName);
    const primaryUrl = summary.originalimage?.source ?? summary.thumbnail?.source;

    if (primaryUrl) {
      console.log(`[wikipedia-place] Using article primary image for "${placeName}"`);
      return this.downloadAndCrop(primaryUrl, placeName);
    }

    // Step 2: search Wikimedia Commons for place photos
    const commonsUrl = await this.findPlaceImageUrl(articleTitle, placeName);
    if (commonsUrl) {
      console.log(`[wikipedia-place] Using Commons image for "${placeName}": ${commonsUrl.slice(0, 80)}...`);
      return this.downloadAndCrop(commonsUrl, placeName);
    }

    throw new ProviderFailedError({
      message: `[wikipedia-place] No suitable photo found for place "${placeName}"`,
      attempts: 2,
      provider: 'wikipedia-place',
      task: 'generateImage',
    });
  }

  private async resolveSummary(placeName: string): Promise<{ summary: WikipediaSummary; articleTitle: string }> {
    let summary: WikipediaSummary;
    try {
      summary = await this.fetchSummary(placeName);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        // Try OpenSearch to correct the title
        const corrected = await this.openSearchCorrect(placeName);
        if (corrected && corrected !== placeName) {
          console.log(`[wikipedia-place] OpenSearch corrected "${placeName}" → "${corrected}"`);
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

    console.log(`[wikipedia-place] "${placeName}" is a disambiguation page, trying suffixes...`);
    for (const suffix of DISAMBIGUATION_SUFFIXES) {
      const candidate = `${summary.title}${suffix}`;
      try {
        const s = await this.fetchSummary(candidate);
        if (s.type !== 'disambiguation') {
          console.log(`[wikipedia-place] Resolved "${placeName}" → "${candidate}"`);
          return { summary: s, articleTitle: s.title };
        }
      } catch {
        // try next suffix
      }
    }

    throw new ProviderFailedError({
      message: `[wikipedia-place] Could not resolve "${placeName}" — all suffixes failed`,
      attempts: DISAMBIGUATION_SUFFIXES.length + 1,
      provider: 'wikipedia-place',
      task: 'generateImage',
    });
  }

  private async findPlaceImageUrl(articleTitle: string, placeName: string): Promise<string | null> {
    // Search Commons using the article title as query
    const commonsQuery = articleTitle.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();

    try {
      const url = `${COMMONS_API_BASE}?action=query&generator=search&gsrsearch=${encodeURIComponent(commonsQuery)}&gsrnamespace=6&prop=imageinfo&iiprop=url|mime|size&iilimit=1&format=json&gsrlimit=30&origin=*`;
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

      const data = await response.json() as {
        query?: { pages?: Record<string, {
          title: string;
          imageinfo?: Array<{ url: string; mime: string; width?: number; height?: number }>;
        }> };
      };

      const pages = Object.values(data.query?.pages ?? {});

      // Sort by width descending — prefer largest available photo
      const sorted = pages.sort((a, b) => {
        const wa = a.imageinfo?.[0]?.width ?? 0;
        const wb = b.imageinfo?.[0]?.width ?? 0;
        return wb - wa;
      });

      for (const page of sorted) {
        const title = page.title ?? '';
        if (!/\.(jpg|jpeg|png)$/i.test(title)) continue;
        if (PLACE_FILENAME_DENY.test(title)) continue;

        // Must match at least one place-type keyword OR contain a word from the place name
        const placeWords = placeName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const matchesPlaceKeyword = PLACE_FILENAME_ALLOW.test(title);
        const matchesPlaceName = placeWords.some(w => title.toLowerCase().includes(w));
        if (!matchesPlaceKeyword && !matchesPlaceName) continue;

        const info = page.imageinfo?.[0];
        if (!info?.mime.startsWith('image/')) continue;
        if ((info.width ?? 0) < 600) continue;

        console.log(`[wikipedia-place] Commons found: ${title} (${info.width}x${info.height})`);
        return info.url;
      }
    } catch {
      // fall through
    }

    return null;
  }

  private async openSearchCorrect(placeName: string): Promise<string | null> {
    const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(placeName)}&limit=1&format=json&origin=*`;
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
    const data = await response.json() as [string, string[]];
    return data[1]?.[0] ?? null;
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
      const err = new Error(`[wikipedia-place] HTTP ${response.status} for "${title}"`);
      (err as { status?: number }).status = response.status;
      throw err;
    }
    return response.json() as Promise<WikipediaSummary>;
  }

  private async downloadAndCrop(imgUrl: string, placeName: string): Promise<Buffer> {
    console.log(`[wikipedia-place] Downloading: ${imgUrl.slice(0, 80)}...`);
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
        message: `[wikipedia-place] Download failed (HTTP ${imgResponse.status}) for "${placeName}"`,
        httpStatus: imgResponse.status,
        attempts: 1,
        provider: 'wikipedia-place',
        task: 'generateImage',
      });
    }
    const rawBuffer = Buffer.from(await imgResponse.arrayBuffer());
    console.log(`[wikipedia-place] Received ${Math.round(rawBuffer.length / 1024)}KB`);

    // Use 'centre' gravity for landscapes — places don't have a face to anchor to top
    const buffer: Buffer = await sharp(rawBuffer)
      .resize(IMAGE_REGION_WIDTH, IMAGE_REGION_HEIGHT, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer();

    console.log(`[wikipedia-place] Cropped to ${IMAGE_REGION_WIDTH}x${IMAGE_REGION_HEIGHT}`);
    return buffer;
  }
}
