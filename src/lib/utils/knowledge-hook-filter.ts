import type { KnowledgeFact } from '@/lib/external/topic-knowledge';

const GENERIC_PATTERNS = [
  /everything is changing/i,
  /nobody is ready/i,
  /the game has changed/i,
  /this changes everything/i,
  /big moves ahead/i,
  /you('re| are) not ready/i,
  /wake up/i,
  /the future is/i,
  /things will never be the same/i,
  /no one is talking about/i,
  /did you know/i,
  /most people don't know/i,
  /here's the truth/i,
];

interface KnowledgeGroundedHookData {
  text: string;
  fact_refs: string[];
  angle: 'insight' | 'surprising' | 'myth-busting';
}

/**
 * Check if a hook introduces claims not traceable to the provided facts.
 * Uses a lightweight heuristic: the hook text must share at least one
 * non-trivial token with at least one referenced fact.
 */
function isTraceable(hook: KnowledgeGroundedHookData, factsById: Map<string, KnowledgeFact>): boolean {
  // All fact_refs must correspond to real fact IDs
  const referencedFacts = hook.fact_refs
    .map(ref => factsById.get(ref))
    .filter((f): f is KnowledgeFact => f !== undefined);

  if (referencedFacts.length === 0) return false;

  // Extract meaningful tokens from the hook (3+ chars, lowercase)
  const hookTokens = new Set(
    hook.text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(t => t.length >= 3)
  );

  // The hook must share at least one substantive token with its referenced facts
  const factText = referencedFacts.map(f => f.text.toLowerCase()).join(' ');
  const factTokens = new Set(
    factText
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(t => t.length >= 3)
  );

  const STOP_WORDS = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
    'her', 'was', 'one', 'our', 'out', 'has', 'his', 'how', 'its', 'may',
    'new', 'now', 'old', 'see', 'way', 'who', 'did', 'got', 'let', 'say',
    'she', 'too', 'use', 'with', 'this', 'that', 'from', 'they', 'been',
    'have', 'many', 'some', 'them', 'than', 'more', 'made', 'what', 'when',
    'will', 'each', 'make', 'like', 'just', 'over', 'such', 'into', 'also',
    'most', 'about', 'which', 'their', 'after', 'would', 'could', 'other',
    'were', 'being', 'where', 'does', 'here',
  ]);

  let sharedCount = 0;
  for (const token of hookTokens) {
    if (STOP_WORDS.has(token)) continue;
    if (factTokens.has(token)) {
      sharedCount++;
    }
  }

  return sharedCount >= 1;
}

function isGenericKnowledgeHook(text: string): boolean {
  if (GENERIC_PATTERNS.some(p => p.test(text))) return true;

  // Must contain at least one proper noun (capitalized word not at start)
  const words = text.split(/\s+/);
  const hasProperNoun = words.slice(1).some(w => /^[A-Z]/.test(w));
  if (!hasProperNoun) return true;

  return false;
}

/**
 * Filter knowledge-grounded hooks:
 * - Remove empty text
 * - Remove hooks with no fact_refs
 * - Remove hooks with invalid fact_refs (not in the source facts)
 * - Remove hooks that introduce claims not traceable to the source facts
 * - Remove generic hooks
 */
export function filterKnowledgeGroundedHooks(
  hooks: KnowledgeGroundedHookData[],
  sourceFacts: KnowledgeFact[],
): KnowledgeGroundedHookData[] {
  const factsById = new Map(sourceFacts.map(f => [f.id, f]));

  return hooks.filter(hook => {
    if (!hook.text || hook.text.trim().length === 0) return false;
    if (!hook.fact_refs || hook.fact_refs.length === 0) return false;

    // At least one fact_ref must be a valid fact ID
    const hasValidRef = hook.fact_refs.some(ref => factsById.has(ref));
    if (!hasValidRef) return false;

    // Traceability check
    if (!isTraceable(hook, factsById)) return false;

    // Generic check
    if (isGenericKnowledgeHook(hook.text)) return false;

    return true;
  });
}
