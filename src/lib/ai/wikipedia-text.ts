/**
 * Wikipedia Text Utility
 *
 * Fetches a short factual description from Wikipedia for a subject (person or place).
 * Used to ground Gemini image prompts with real-world detail when AI generation
 * is preferred over Wikipedia photos.
 *
 * Returns the first 1-2 sentences of the article extract, or null if not found.
 */

const WIKIPEDIA_REST_BASE = 'https://en.wikipedia.org/api/rest_v1/page';
const REQUEST_TIMEOUT_MS = 8_000;

const DISAMBIGUATION_SUFFIXES = [
  '_(ranch)',
  '_(estate)',
  '_(property)',
  '_(musician)',
  '_(singer)',
  '_(actor)',
  '_(entertainer)',
  '_(athlete)',
];

/**
 * Fetch 1-2 sentence Wikipedia description for a subject.
 * Returns null on any failure — callers should treat this as optional enrichment.
 */
export async function fetchWikipediaExtract(query: string): Promise<string | null> {
  try {
    const summary = await resolveSummary(query);
    if (!summary?.extract) return null;

    // Return first 1-2 sentences (up to ~300 chars) — enough to ground Gemini
    const sentences = summary.extract
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.trim().length > 0);

    const extract = sentences.slice(0, 2).join(' ').trim();
    return extract.length > 20 ? extract : null;
  } catch {
    return null;
  }
}

interface WikipediaSummary {
  type: string;
  title: string;
  extract?: string;
}

async function fetchSummary(title: string): Promise<WikipediaSummary> {
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
    const err = new Error(`[wikipedia-text] HTTP ${response.status} for "${title}"`);
    (err as { status?: number }).status = response.status;
    throw err;
  }
  return response.json() as Promise<WikipediaSummary>;
}

async function resolveSummary(query: string): Promise<WikipediaSummary | null> {
  try {
    const summary = await fetchSummary(query);
    if (summary.type !== 'disambiguation') return summary;

    // Try known suffixes to resolve disambiguation
    for (const suffix of DISAMBIGUATION_SUFFIXES) {
      try {
        const s = await fetchSummary(`${summary.title}${suffix}`);
        if (s.type !== 'disambiguation') return s;
      } catch {
        // try next suffix
      }
    }
    return null;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 404) return null;
    throw err;
  }
}
