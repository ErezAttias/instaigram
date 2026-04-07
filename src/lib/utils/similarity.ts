// ─── Similarity Utilities ────────────────────────────────────

/** Common stop words to exclude from analysis */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both',
  'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
  'too', 'very', 'just', 'because', 'if', 'when', 'while', 'where',
  'how', 'what', 'which', 'who', 'whom', 'this', 'that', 'these',
  'those', 'it', 'its', 'up', 'about', 'also',
]);

/** Articles and pronouns to strip during pattern extraction */
const ARTICLES = new Set(['the', 'a', 'an']);
const PRONOUNS = new Set([
  'i', 'me', 'my', 'mine', 'myself',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself',
  'we', 'us', 'our', 'ours', 'ourselves',
  'they', 'them', 'their', 'theirs', 'themselves',
]);

/**
 * Tokenize a string into a Set of lowercase words.
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 0)
  );
}

/**
 * Tokenize a string into an array of lowercase words (preserving order/duplicates).
 */
function tokenizeToArray(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * Compute the Jaccard similarity between two strings.
 * Tokenizes both to lowercase word sets, then returns |intersection| / |union|.
 * Returns 0 if both strings are empty.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);

  if (setA.size === 0 && setB.size === 0) return 0;

  let intersectionSize = 0;
  for (const word of setA) {
    if (setB.has(word)) {
      intersectionSize++;
    }
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  if (unionSize === 0) return 0;

  return intersectionSize / unionSize;
}

/**
 * Extract all n-grams of a given word length from a text.
 */
function extractNgrams(text: string, n: number): string[] {
  const words = tokenizeToArray(text);

  if (words.length < n) return [];

  const ngrams: string[] = [];
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

/**
 * Find phrases (n-grams) that repeat across multiple texts.
 * @param texts - Array of text strings to analyze
 * @param minLength - Minimum number of words per phrase (default: 3)
 * @returns Map of phrase -> count (only phrases appearing 2+ times across texts)
 */
export function findRepeatedPhrases(
  texts: string[],
  minLength: number = 3
): Map<string, number> {
  const phraseCounts = new Map<string, number>();

  for (const text of texts) {
    const ngrams = extractNgrams(text, minLength);
    // Use a set per text to count each phrase at most once per text
    const uniqueNgrams = new Set(ngrams);
    for (const ngram of uniqueNgrams) {
      phraseCounts.set(ngram, (phraseCounts.get(ngram) ?? 0) + 1);
    }
  }

  // Filter to phrases appearing 2+ times
  const repeated = new Map<string, number>();
  for (const [phrase, count] of phraseCounts) {
    if (count >= 2) {
      repeated.set(phrase, count);
    }
  }

  return repeated;
}

/**
 * Extract a pattern from text for detecting repeated openings.
 * Normalizes aggressively: lowercases, removes punctuation, strips articles,
 * pronouns, and possessives ('s), then returns the first `wordCount` content words.
 */
export function extractPattern(text: string, wordCount: number = 3): string {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Strip possessives (e.g., "someone's" -> "someone")
    .replace(/(\w+)s\b/g, (match, base) => {
      // Only strip trailing 's if it looks like a possessive, not a plural
      // Simple heuristic: if the word without 's is 3+ chars, strip it
      return base.length >= 3 ? base : match;
    })
    .split(' ')
    .filter((w) => w.length > 0)
    // Remove articles and pronouns for more aggressive normalization
    .filter((w) => !ARTICLES.has(w) && !PRONOUNS.has(w));

  return words.slice(0, wordCount).join(' ');
}

/**
 * Count word occurrences across all provided texts.
 * Returns a map of word -> total number of texts containing that word.
 * Each word is counted at most once per text.
 */
export function wordFrequency(texts: string[]): Map<string, number> {
  const freq = new Map<string, number>();

  for (const text of texts) {
    // Use a set to count each word at most once per text
    const words = new Set(tokenizeToArray(text));
    for (const word of words) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }
  }

  return freq;
}

/**
 * Count how many texts start with each word.
 * Returns a map of starting word -> count.
 */
export function startingWordDistribution(texts: string[]): Map<string, number> {
  const dist = new Map<string, number>();

  for (const text of texts) {
    const words = tokenizeToArray(text);
    if (words.length === 0) continue;

    const firstWord = words[0];
    dist.set(firstWord, (dist.get(firstWord) ?? 0) + 1);
  }

  return dist;
}

/**
 * Check whether a word is a common stop word.
 */
export function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word.toLowerCase());
}
