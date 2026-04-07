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
];

export function isGenericHook(text: string): boolean {
  // Check against known generic patterns
  if (GENERIC_PATTERNS.some(pattern => pattern.test(text))) {
    return true;
  }

  // Check if hook has no proper nouns (words starting with uppercase that aren't the first word)
  const words = text.split(/\s+/);
  const hasProperNoun = words.slice(1).some(word => /^[A-Z]/.test(word));
  if (!hasProperNoun) {
    return true;
  }

  return false;
}

interface RealityGroundedHookData {
  text: string;
  entity_refs: string[];
  event_summary: string;
  angle: 'insight' | 'controversy' | 'irony' | 'data';
}

export function filterRealityGroundedHooks(hooks: RealityGroundedHookData[]): RealityGroundedHookData[] {
  return hooks.filter(hook => {
    // Remove hooks with empty text
    if (!hook.text || hook.text.trim().length === 0) return false;

    // Remove hooks with no entity_refs
    if (!hook.entity_refs || hook.entity_refs.length === 0) return false;

    // Remove hooks with empty event_summary
    if (!hook.event_summary || hook.event_summary.trim().length === 0) return false;

    // Remove generic hooks
    if (isGenericHook(hook.text)) return false;

    return true;
  });
}
