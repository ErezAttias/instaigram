/**
 * Lightweight external topic events fetcher with TTL cache.
 * Uses NewsAPI.org to retrieve recent headlines for a given topic.
 *
 * Env vars:
 *   NEWS_API_KEY  — required for external fetch
 *   NEWS_API_URL  — optional override (default: https://newsapi.org/v2)
 *   TOPIC_EVENTS_CACHE_TTL_MS — cache TTL in ms (default: 300000 = 5 min)
 */

const DEFAULT_API_URL = 'https://newsapi.org/v2';
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface TopicEvent {
  id: string;
  headline: string;
  summary: string;
  source: string;
  timestamp: string;
  entities: string[];
}

// ─── In-memory TTL cache ──────────────────────────────────────

interface CacheEntry {
  events: TopicEvent[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCacheTtl(): number {
  const env = process.env.TOPIC_EVENTS_CACHE_TTL_MS;
  if (env) {
    const parsed = parseInt(env, 10);
    if (!isNaN(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_CACHE_TTL_MS;
}

function cacheKey(topic: string, count: number): string {
  return `${topic.toLowerCase().trim()}::${count}`;
}

/**
 * Extract lightweight entities from a headline + summary.
 * Finds capitalized multi-word sequences that look like proper nouns.
 */
function extractEntities(text: string): string[] {
  // Match sequences of capitalized words (2+ chars) that aren't sentence starters
  const matches = text.match(/(?<![.!?]\s)(?<!\b(?:The|A|An|In|On|At|By|For|To|Of|And|But|Or|Is|It|As|So)\s)[A-Z][a-z]{1,}(?:\s[A-Z][a-z]{1,})*/g) || [];

  // Deduplicate
  const unique = [...new Set(matches)];

  // Filter out very common words that get false-positive matched
  const stopWords = new Set(['The', 'This', 'That', 'These', 'Those', 'Here', 'There', 'When', 'Where', 'What', 'Which', 'How', 'Why', 'Who']);
  return unique.filter(e => !stopWords.has(e) && e.length > 2);
}

/**
 * Fetch recent topic-relevant events from NewsAPI.
 * Returns 5-10 structured items. Results are cached for TTL duration.
 *
 * @throws if NEWS_API_KEY is not set
 */
export async function fetchTopicEvents(topic: string, count: number = 10): Promise<TopicEvent[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    throw new Error('[topic-events] NEWS_API_KEY env var is required for external topic fetch');
  }

  // ─── Check cache ────────────────────────────────────────────
  const key = cacheKey(topic, count);
  const ttl = getCacheTtl();
  const cached = cache.get(key);

  if (cached && (Date.now() - cached.fetchedAt) < ttl) {
    console.log(`[topic-events] Cache HIT for topic="${topic}" (age: ${Math.round((Date.now() - cached.fetchedAt) / 1000)}s, ttl: ${Math.round(ttl / 1000)}s)`);
    return cached.events;
  }

  // ─── Fetch from NewsAPI ─────────────────────────────────────
  const baseUrl = process.env.NEWS_API_URL || DEFAULT_API_URL;
  const url = new URL(`${baseUrl}/everything`);
  url.searchParams.set('q', topic);
  url.searchParams.set('sortBy', 'publishedAt');
  url.searchParams.set('pageSize', String(Math.min(count, 10)));
  url.searchParams.set('language', 'en');
  url.searchParams.set('apiKey', apiKey);

  console.log(`[topic-events] Cache MISS — fetching from NewsAPI | topic="${topic}" count=${count}`);

  const response = await fetch(url.toString(), {
    headers: { 'User-Agent': 'InstAIgram/1.0' },
    signal: AbortSignal.timeout(10_000), // 10s timeout
  });

  if (!response.ok) {
    const body = await response.text().catch(() => 'unknown');
    throw new Error(`[topic-events] NewsAPI returned HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json() as {
    status: string;
    totalResults: number;
    articles: Array<{
      title: string | null;
      description: string | null;
      source: { name: string } | null;
      publishedAt: string | null;
      url: string | null;
    }>;
  };

  if (data.status !== 'ok' || !data.articles) {
    throw new Error(`[topic-events] NewsAPI response status: ${data.status}`);
  }

  const events: TopicEvent[] = data.articles
    .filter(a => a.title && a.title.trim().length > 0)
    .slice(0, count)
    .map((article, i) => {
      const headline = article.title || '';
      const summary = article.description || '';
      const combined = `${headline} ${summary}`;

      return {
        id: `evt-${i + 1}`,
        headline,
        summary: summary.slice(0, 300),
        source: article.source?.name || 'Unknown',
        timestamp: article.publishedAt || new Date().toISOString(),
        entities: extractEntities(combined),
      };
    });

  // ─── Store in cache ─────────────────────────────────────────
  cache.set(key, { events, fetchedAt: Date.now() });
  console.log(`[topic-events] Fetched ${events.length} events for topic="${topic}" — cached for ${Math.round(ttl / 1000)}s`);
  return events;
}
