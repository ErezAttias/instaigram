/**
 * Verb Check — Detects whether a Bold-layout headline contains a real action verb.
 *
 * Used by the compress step to enforce that every Bold FACT headline is a complete
 * claim (subject + verb + object) rather than a label ("X: Y", "X in Y", "X as Y",
 * "X of Y", "X's [adjective] Y" — all patterns we've seen slip past the LLM).
 *
 * Strategy: deterministic check, no LLM calls. Fast and reliable.
 *   1. Tokenize the headline.
 *   2. For each token, check if it's a known action verb (curated list) or has
 *      a verb-like morphology (-ed, -ing, -s endings that aren't plurals/possessives).
 *   3. Exclude prepositions, articles, and bare copulas (is/are/was/were) unless
 *      followed by a past participle (e.g., "Was Killed").
 *
 * If no verb is found → the headline is a label, rewrite it.
 */

// ─── Verb Lists ────────────────────────────────────────────────

/**
 * Common action verbs that appear in fact headlines. Not exhaustive — used as a
 * first-pass whitelist so we don't need morphological analysis for frequent cases.
 * All lowercase for case-insensitive matching.
 */
const ACTION_VERBS = new Set([
  // Past tense / participle
  'killed', 'survived', 'sold', 'mentioned', 'discovered', 'invented', 'built',
  'destroyed', 'saved', 'lost', 'found', 'broke', 'crafted', 'defeated',
  'swallowed', 'ate', 'drank', 'fought', 'married', 'ruled', 'conquered',
  'sang', 'wrote', 'painted', 'sculpted', 'composed', 'filmed', 'recorded',
  'launched', 'landed', 'crashed', 'sank', 'flew', 'walked', 'ran', 'swam',
  'turned', 'became', 'went', 'came', 'left', 'arrived', 'escaped', 'hid',
  'revealed', 'showed', 'proved', 'denied', 'claimed', 'admitted',
  'banned', 'allowed', 'forced', 'made', 'took', 'gave', 'stole', 'earned',
  'beat', 'won', 'tied', 'scored', 'hit', 'struck', 'threw', 'caught',
  'shot', 'stabbed', 'poisoned', 'drowned', 'burned', 'froze', 'melted',
  'predicted', 'named', 'called', 'spelled', 'translated',
  // Present tense / third person
  'kills', 'survives', 'sells', 'mentions', 'discovers', 'invents', 'builds',
  'destroys', 'saves', 'loses', 'finds', 'breaks', 'crafts', 'defeats',
  'swallows', 'eats', 'drinks', 'fights', 'marries', 'rules', 'conquers',
  'sings', 'writes', 'paints', 'sculpts', 'composes', 'films', 'records',
  'launches', 'lands', 'crashes', 'sinks', 'flies', 'walks', 'runs', 'swims',
  'turns', 'becomes', 'goes', 'comes', 'leaves', 'arrives', 'escapes', 'hides',
  'reveals', 'shows', 'proves', 'denies', 'claims', 'admits',
  'bans', 'allows', 'forces', 'makes', 'takes', 'gives', 'steals', 'earns',
  'beats', 'wins', 'ties', 'scores', 'hits', 'strikes', 'throws', 'catches',
  'shoots', 'stabs', 'poisons', 'drowns', 'burns', 'freezes', 'melts',
  'predicts', 'names', 'calls', 'spells', 'translates',
  'pumps', 'pump', 'stops', 'stop', 'starts', 'start', 'beats', 'beat',
  'holds', 'hold', 'carries', 'carry', 'contains', 'contain',
  'reaches', 'reach', 'produces', 'produce', 'creates', 'create',
  'lives', 'live', 'lived', 'dies', 'die', 'died', 'grows', 'grow', 'grew',
  'drinks', 'drink', 'drank', 'spoils', 'spoil', 'spoiled', 'lasts', 'last', 'lasted',
  'weighs', 'weigh', 'weighed', 'measures', 'measure', 'measured',
  'covers', 'cover', 'covered', 'spans', 'span', 'spanned',
  'outlasts', 'outlasted', 'outnumbers', 'outnumbered', 'outlived',
  'expires', 'expire', 'expired', 'survives', 'survive',
  'owns', 'own', 'owned', 'keeps', 'keep', 'kept',
  'uses', 'use', 'used', 'needs', 'need', 'needed',
  'fears', 'fear', 'feared', 'loves', 'love', 'loved', 'hates', 'hate', 'hated',
  'appears', 'appear', 'appeared', 'seems', 'seem', 'seemed',
  'sprang', 'sprung', 'springs', 'spring',
  'spray', 'sprays', 'sprayed', 'spraying',
  'raised', 'raises', 'raise',
  'graces', 'grace', 'graced',
  'guards', 'guard', 'guarded', 'protects', 'protect', 'protected',
  // Common irregulars
  'has', 'have', 'had', 'does', 'do', 'did', 'says', 'say', 'said',
  'sees', 'see', 'saw', 'gets', 'get', 'got',
  'thinks', 'think', 'thought', 'knows', 'know', 'knew',
]);

/**
 * Words that SHOULDN'T count as verbs even though they might look verb-like.
 * Excludes copulas alone (need to pair with a past participle to carry a claim)
 * and common false positives from morphology heuristics.
 */
const COPULAS_ALONE = new Set(['is', 'are', 'was', 'were', 'be', 'been', 'being']);

/** Prepositions and small words that should never be classified as verbs. */
const NON_VERBS = new Set([
  'in', 'of', 'on', 'at', 'for', 'with', 'from', 'by', 'about', 'as',
  'to', 'into', 'onto', 'over', 'under', 'through', 'between', 'among',
  'the', 'a', 'an', 'and', 'or', 'but', 'nor', 'so', 'yet',
  'this', 'that', 'these', 'those', 'his', 'her', 'their', 'our', 'your', 'its',
]);

/**
 * Common adjective-ed words that end in -ed but are NOT past-tense verbs in
 * headline context. E.g. "Zeus's Failed Prophecy" — "failed" is a modifier,
 * not the main predicate. Add sparingly: only words that frequently appear as
 * pre-noun adjectives in fact headlines.
 */
const ADJECTIVE_ED = new Set([
  'failed', 'hidden', 'secret', 'sacred', 'ancient', 'alleged', 'supposed',
  'beloved', 'wicked', 'naked', 'twisted', 'crooked', 'haunted', 'cursed',
  'blessed', 'forbidden', 'fabled', 'famed', 'faded', 'feared',
]);

/** Common noun endings that look like verbs. Exclude these from morphology detection. */
const NOUN_LIKE_SUFFIXES = [
  'ings', // "buildings" — plural of -ing noun
  'ness', // "kindness"
  'ment', // "achievement"
  'tion', 'sion', // "solution", "tension"
  'ance', 'ence', // "performance", "difference"
  'ship', // "relationship"
];

// ─── Core Check ────────────────────────────────────────────────

/**
 * Strip punctuation and tokenize a headline into lowercase words.
 */
function tokenize(headline: string): string[] {
  return headline
    .toLowerCase()
    // Remove possessive 's but keep the word
    .replace(/['']s\b/g, '')
    // Replace non-word chars with spaces
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Heuristic: does this token look like an inflected verb?
 * Matches -ed, -ing endings with basic filters to avoid nouns/adjectives.
 */
function looksLikeInflectedVerb(token: string): boolean {
  if (token.length < 4) return false;

  // -ed ending (past tense / past participle)
  if (token.endsWith('ed')) {
    // Exclude common pre-noun adjectives that end in -ed (e.g. "failed", "hidden").
    if (ADJECTIVE_ED.has(token)) return false;
    if (token.length >= 5) return true;
  }

  // -ing ending (present participle, gerund)
  if (token.endsWith('ing')) {
    // Exclude common noun forms
    for (const suffix of NOUN_LIKE_SUFFIXES) {
      if (token.endsWith(suffix)) return false;
    }
    // Exclude words where -ing is part of a noun (e.g., "king", "thing", "ring")
    // These are short and wouldn't match most headlines anyway.
    if (token.length >= 5) return true;
  }

  return false;
}

/**
 * Does the given headline contain a real action verb?
 *
 * Rules:
 *   - At least one token must be in ACTION_VERBS, OR
 *   - At least one token must look like an inflected verb (-ed/-ing).
 *   - Copula-only matches don't count unless paired with a past participle.
 *   - Prepositions and articles never count.
 */
export function hasActionVerb(headline: string): boolean {
  const tokens = tokenize(headline);
  if (tokens.length === 0) return false;

  let hasCopula = false;

  for (const token of tokens) {
    if (NON_VERBS.has(token)) continue;
    if (COPULAS_ALONE.has(token)) {
      hasCopula = true;
      continue;
    }
    if (ACTION_VERBS.has(token)) return true;
    if (looksLikeInflectedVerb(token)) return true;
  }

  // "Was killed" pattern — copula + past participle. If we saw a copula and any
  // token ends in -ed (excluding known adjectives), accept.
  if (hasCopula && tokens.some(t => t.length >= 4 && t.endsWith('ed') && !NON_VERBS.has(t) && !ADJECTIVE_ED.has(t))) {
    return true;
  }

  return false;
}

/**
 * Detect common label-style anti-patterns. These are headlines structured as
 * "X in Y", "X: Y", "X as Y", "X of Y", "X's [adjective] Y" — all of which
 * lack a claim-carrying verb.
 *
 * Returns the detected pattern name, or null if none matched.
 */
export function detectLabelPattern(headline: string): string | null {
  const trimmed = headline.trim();

  // "X: Y" (colon label)
  if (/^[A-Z][^:]{3,}:\s+\S/.test(trimmed) && !hasActionVerb(trimmed)) {
    return 'colon_label';
  }

  // Compact check for the common bad patterns when no verb is present
  if (!hasActionVerb(trimmed)) {
    if (/\bin\b/i.test(trimmed)) return 'x_in_y';
    if (/\bas\b/i.test(trimmed)) return 'x_as_y';
    if (/\bof\b/i.test(trimmed)) return 'x_of_y';
    if (/'s\b/.test(trimmed)) return 'possessive';
    return 'no_verb';
  }

  return null;
}
