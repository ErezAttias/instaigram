/**
 * Lightweight knowledge fetcher for non-time-sensitive topics.
 * Uses Wikipedia REST API to retrieve a topic summary and extract atomic facts.
 *
 * No API key required — Wikipedia REST API is free and open.
 */

export interface KnowledgeFact {
  id: string;
  text: string;
  entities: string[];
}

export interface TopicKnowledge {
  topic: string;
  source: string;
  sourceUrl: string;
  facts: KnowledgeFact[];
}

const WIKIPEDIA_API = 'https://en.wikipedia.org/api/rest_v1';

/**
 * Extract proper-noun entities from a sentence.
 */
function extractEntities(text: string): string[] {
  const matches = text.match(
    /(?<![.!?]\s)(?<!\b(?:The|A|An|In|On|At|By|For|To|Of|And|But|Or|Is|It|As|So|This|That|These|Those|Its|Their|His|Her)\s)[A-Z][a-z]{1,}(?:\s[A-Z][a-z]{1,})*/g
  ) || [];
  const stopWords = new Set([
    'The', 'This', 'That', 'These', 'Those', 'Here', 'There',
    'When', 'Where', 'What', 'Which', 'How', 'Why', 'Who',
    'However', 'Although', 'Because', 'Since', 'After', 'Before',
  ]);
  return [...new Set(matches)].filter(e => !stopWords.has(e) && e.length > 2);
}

/**
 * Split a Wikipedia extract into atomic fact sentences.
 * Filters out meta/navigational sentences.
 */
function splitIntoFacts(extract: string, limit: number): KnowledgeFact[] {
  const sentences = extract
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => {
      if (s.length < 20) return false;
      // Skip meta sentences
      if (/^(see also|for more|this article|main article)/i.test(s)) return false;
      // Skip sentences that are just parenthetical disambiguation
      if (/^\(/.test(s)) return false;
      return true;
    });

  return sentences.slice(0, limit).map((text, i) => ({
    id: `fact-${i + 1}`,
    text,
    entities: extractEntities(text),
  }));
}

/**
 * Fetch topic knowledge from Wikipedia.
 * Returns 5–15 atomic facts extracted from the article summary.
 *
 * @throws if Wikipedia returns no usable content
 */
export async function fetchTopicKnowledge(
  topic: string,
  factLimit: number = 15,
): Promise<TopicKnowledge> {
  // Normalize topic for Wikipedia title format
  const wikiTitle = topic
    .trim()
    .replace(/\s+/g, '_')
    .replace(/^./, c => c.toUpperCase());

  const url = `${WIKIPEDIA_API}/page/summary/${encodeURIComponent(wikiTitle)}`;

  console.log(`[topic-knowledge] Task: fetch_topic_knowledge | topic="${topic}" wikiTitle="${wikiTitle}"`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'InstAIgram/1.0 (contact: dev@instaigram.app)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(8_000),
  });

  if (response.status === 404) {
    // Try a search-based fallback
    return fetchViaSearch(topic, factLimit);
  }

  if (!response.ok) {
    throw new Error(`[topic-knowledge] Wikipedia returned HTTP ${response.status}`);
  }

  const data = await response.json() as {
    type: string;
    title: string;
    extract: string;
    content_urls?: { desktop?: { page?: string } };
  };

  if (data.type === 'disambiguation') {
    // Disambiguation pages don't have useful content — try search
    return fetchViaSearch(topic, factLimit);
  }

  if (!data.extract || data.extract.trim().length < 50) {
    throw new Error(`[topic-knowledge] Wikipedia extract too short for topic="${topic}"`);
  }

  const facts = splitIntoFacts(data.extract, factLimit);

  if (facts.length < 3) {
    throw new Error(`[topic-knowledge] Only ${facts.length} facts extracted — insufficient for grounded generation`);
  }

  const sourceUrl = data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${wikiTitle}`;
  console.log(`[topic-knowledge] Extracted ${facts.length} facts from Wikipedia article "${data.title}"`);

  return {
    topic,
    source: 'Wikipedia',
    sourceUrl,
    facts,
  };
}

/**
 * Fallback: search Wikipedia for the topic and use the first result.
 */
async function fetchViaSearch(topic: string, factLimit: number): Promise<TopicKnowledge> {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=1&format=json&origin=*`;

  console.log(`[topic-knowledge] Direct lookup failed, trying search for "${topic}"`);

  const searchResp = await fetch(searchUrl, {
    headers: { 'User-Agent': 'InstAIgram/1.0' },
    signal: AbortSignal.timeout(8_000),
  });

  if (!searchResp.ok) {
    throw new Error(`[topic-knowledge] Wikipedia search returned HTTP ${searchResp.status}`);
  }

  const searchData = await searchResp.json() as {
    query?: { search?: Array<{ title: string }> };
  };

  const firstResult = searchData.query?.search?.[0];
  if (!firstResult) {
    throw new Error(`[topic-knowledge] No Wikipedia results found for "${topic}"`);
  }

  // Fetch the summary of the found article
  const summaryUrl = `${WIKIPEDIA_API}/page/summary/${encodeURIComponent(firstResult.title)}`;
  const summaryResp = await fetch(summaryUrl, {
    headers: {
      'User-Agent': 'InstAIgram/1.0',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(8_000),
  });

  if (!summaryResp.ok) {
    throw new Error(`[topic-knowledge] Wikipedia summary fetch failed for "${firstResult.title}"`);
  }

  const summaryData = await summaryResp.json() as {
    title: string;
    extract: string;
    content_urls?: { desktop?: { page?: string } };
  };

  if (!summaryData.extract || summaryData.extract.trim().length < 50) {
    throw new Error(`[topic-knowledge] Insufficient content for "${firstResult.title}"`);
  }

  const facts = splitIntoFacts(summaryData.extract, factLimit);

  if (facts.length < 3) {
    throw new Error(`[topic-knowledge] Only ${facts.length} facts extracted from "${firstResult.title}"`);
  }

  const sourceUrl = summaryData.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(firstResult.title)}`;
  console.log(`[topic-knowledge] Extracted ${facts.length} facts from Wikipedia search result "${summaryData.title}"`);

  return {
    topic,
    source: 'Wikipedia',
    sourceUrl,
    facts,
  };
}
