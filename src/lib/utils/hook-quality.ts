// Hook quality scoring and improvement heuristics.
// No embeddings, no NLP libraries — just pattern-based checks.

export interface HookScores {
  clarity: number;
  originality: number;
  stoppingPower: number;
  visualPotential: number;
  average: number;
}

export interface ScoredHook {
  text: string;
  type: string;
  visualHint?: string;
  scores: HookScores;
  flags: string[];
}

// ─── Generic Pattern Bans ────────────────────────────────────

const BANNED_OPENERS = [
  'most people',
  'nobody talks about',
  'nobody is talking about',
  'you are doing',
  'you\'re doing',
  'here\'s why',
  'here is why',
  'this is why',
  'the truth about',
  'the real reason',
  'the secret to',
  'what nobody tells you',
  'unpopular opinion',
  'hot take',
  'let me tell you',
  'i need to tell you',
  'can we talk about',
  'we need to talk about',
];

const GENERIC_PHRASES = [
  'game changer',
  'next level',
  'level up',
  'unlock your',
  'the key to',
  'the secret is',
  'mindset shift',
  'wake up call',
  'hard truth',
  'brutal truth',
  'real talk',
  'no one tells you',
  'they don\'t want you to know',
  'everything you know is wrong',
  'change your life',
  'transform your',
];

const VAGUE_WORDS = [
  'things', 'stuff', 'something', 'everything', 'anything',
  'somehow', 'maybe', 'probably', 'basically', 'literally',
  'actually', 'really', 'just', 'very', 'totally',
  'amazing', 'incredible', 'insane', 'crazy', 'mind-blowing',
];

// ─── Visual Potential Markers ────────────────────────────────

// Patterns that translate well to visual carousel slides
const VISUAL_PATTERNS = {
  // Contrast/comparison — naturally creates split-screen or before/after layouts
  contrast: /\b(vs\.?|versus|compared to|while|instead of)\b/i,
  emDashContrast: /\s—\s/,
  butContrast: /\sbut\s/i,
  notContrast: /\snot\s/i,

  // Numbers/metrics — create data-visual or stat slides
  numbers: /\b\d+[%kKmM]?\b/,

  // Scenario/outcome — implies a story or sequence
  scenario: /\b(when you|every time|after|before|people who|the moment)\b/i,
  outcome: /\b(and (then|still|yet)|results in|leads to|causes|get[s]?\s)/i,

  // Action/imperative — implies demonstration or step
  action: /^(delete|stop|try|open|look at|check|compare|count|screenshot)/i,

  // Specific objects — can be shown visually
  concreteObjects: /\b(phone|screen|dashboard|calendar|inbox|feed|post|slide|template|notification|app|profile|bio|grid)\b/i,

  // Time-based — implies timeline or progression visual
  temporal: /\b(30 days|every (day|week|morning)|last (year|month|week)|for \d+|hours?|minutes?)\b/i,

  // Identity/persona — implies character or avatar visual
  identity: /\b(creator|founder|freelancer|marketer|designer|writer|coach|guru|influencer)\b/i,
};

// Abstract patterns that are hard to visualize
const ABSTRACT_MARKERS = [
  'overrated', 'underrated', 'is dead', 'is dying',
  'mindset', 'perspective', 'philosophy', 'approach',
  'in general', 'on the whole', 'fundamentally',
  'essence of', 'nature of', 'concept of',
];

function countVisualSignals(text: string): number {
  let count = 0;
  for (const pattern of Object.values(VISUAL_PATTERNS)) {
    if (pattern.test(text)) count++;
  }
  return count;
}

function isAbstract(text: string): boolean {
  const lower = text.toLowerCase();
  return ABSTRACT_MARKERS.filter(m => lower.includes(m)).length >= 2;
}

// ─── Visual Hint Generator ──────────────────────────────────

export function generateVisualHint(text: string): string {
  const lower = text.toLowerCase();

  // Detect the dominant visual pattern and generate a hint
  if (VISUAL_PATTERNS.numbers.test(text)) {
    return 'stat comparison or data callout with bold number';
  }
  if (VISUAL_PATTERNS.contrast.test(text) || VISUAL_PATTERNS.emDashContrast.test(text)) {
    return 'split-screen contrast between two sides';
  }
  if (VISUAL_PATTERNS.butContrast.test(text) || VISUAL_PATTERNS.notContrast.test(text)) {
    return 'expectation vs reality reveal';
  }
  if (VISUAL_PATTERNS.scenario.test(text)) {
    return 'relatable scenario moment the reader recognizes';
  }
  if (VISUAL_PATTERNS.action.test(text)) {
    return 'demonstration or screenshot-style proof';
  }
  if (VISUAL_PATTERNS.temporal.test(text)) {
    return 'timeline or before/after progression';
  }
  if (VISUAL_PATTERNS.concreteObjects.test(text)) {
    const match = text.match(VISUAL_PATTERNS.concreteObjects);
    return `close-up focus on ${match?.[0]?.toLowerCase() || 'the object'} with text overlay`;
  }
  if (VISUAL_PATTERNS.identity.test(text)) {
    return 'character-driven scene or persona illustration';
  }
  if (lower.endsWith('?')) {
    return 'provocative question as bold text with dark background';
  }

  // Fallback: bold text on minimal background
  return 'bold statement text on clean minimal background';
}

// ─── Specificity Markers ─────────────────────────────────────

function hasConcreteElement(text: string): boolean {
  const lower = text.toLowerCase();

  if (/\d+/.test(text)) return true;

  const specifics = [
    'instagram', 'reels', 'carousel', 'tiktok', 'linkedin', 'youtube',
    'algorithm', 'analytics', 'dashboard', 'calendar', 'template',
    'engagement pod', 'hashtag', 'cta', 'hook', 'caption',
    'morning routine', 'content calendar', 'batch creat',
    'passive income', 'niche', 'rebrand', 'viral',
    'canva', 'notion', 'chatgpt', 'figma',
    'phone', 'screen', 'inbox', 'notification',
  ];
  if (specifics.some(s => lower.includes(s))) return true;

  if (/\s—\s/.test(text) || /\snot\s/.test(lower) || /\sbut\s/.test(lower)) return true;

  if (/\b(2019|2020|2021|2022|2023|2024|2025|2026|yesterday|last\s|first\s|every\s(day|week|morning))\b/i.test(text)) return true;

  return false;
}

function hasTension(text: string): boolean {
  const lower = text.toLowerCase();

  if (text.endsWith('?')) return true;

  const tensionWords = [
    'killing', 'destroying', 'ruined', 'broke', 'dead',
    'trap', 'lie', 'myth', 'scam', 'fraud', 'fake',
    'addicted', 'obsess', 'hollow', 'empty', 'worthless',
    'never', 'wrong', 'fail', 'mistake', 'problem',
    'stop', 'quit', 'refuse', 'reject', 'burn',
    'isn\'t', 'aren\'t', 'won\'t', 'can\'t', 'don\'t',
    'zero', 'nobody', 'nothing',
  ];
  if (tensionWords.some(w => lower.includes(w))) return true;

  if (text.includes('—')) return true;

  return false;
}

// ─── Scoring Functions ───────────────────────────────────────

function scoreClarityRaw(text: string): number {
  let score = 7;
  const words = text.split(/\s+/);

  const vagueCount = words.filter(w => VAGUE_WORDS.includes(w.toLowerCase().replace(/[^a-z]/g, ''))).length;
  score -= vagueCount * 1.5;

  if (words.length >= 7 && words.length <= 10) score += 1;
  if (words.length > 12) score -= 2;
  if (words.length <= 5) score -= 0.5;

  const commas = (text.match(/,/g) || []).length;
  if (commas > 1) score -= 1;

  if (!text.includes(' and ') && !text.includes(', and')) score += 0.5;

  return Math.max(1, Math.min(10, Math.round(score)));
}

function scoreOriginalityRaw(text: string, allHooks: string[]): number {
  let score = 7;
  const lower = text.toLowerCase();

  if (BANNED_OPENERS.some(b => lower.startsWith(b))) score -= 3;

  const genericCount = GENERIC_PHRASES.filter(p => lower.includes(p)).length;
  score -= genericCount * 2;

  if (/^(stop|start|try|use|get|make|find|build)\s/i.test(text)) score -= 1;
  if (/^(the|a|an)\s\w+\s(is|are|was|were)\s/i.test(text)) score -= 0.5;

  if (text.includes('—')) score += 0.5;
  if (text.endsWith('?') && !lower.startsWith('did you') && !lower.startsWith('have you')) score += 0.5;

  const thisWords = new Set(lower.split(/\s+/));
  let maxOverlap = 0;
  for (const other of allHooks) {
    if (other === text) continue;
    const otherWords = new Set(other.toLowerCase().split(/\s+/));
    const intersection = [...thisWords].filter(w => otherWords.has(w) && w.length > 3);
    const overlap = intersection.length / Math.min(thisWords.size, otherWords.size);
    if (overlap > maxOverlap) maxOverlap = overlap;
  }
  if (maxOverlap > 0.6) score -= 2;
  if (maxOverlap > 0.4) score -= 1;

  return Math.max(1, Math.min(10, Math.round(score)));
}

function scoreStoppingPowerRaw(text: string): number {
  let score = 6;

  if (hasTension(text)) score += 2;
  if (hasConcreteElement(text)) score += 1;
  if (/\byou(r|'re|'ve)?\b/i.test(text)) score += 0.5;

  const strongStarters = [
    'stop', 'kill', 'destroy', 'burn', 'delete', 'refuse',
    'forget', 'abandon', 'ditch', 'drop', 'skip', 'ignore',
  ];
  const firstWord = text.split(/\s/)[0].toLowerCase();
  if (strongStarters.includes(firstWord)) score += 1;

  const weakStarters = ['it', 'there', 'this', 'that', 'one', 'some', 'many', 'several'];
  if (weakStarters.includes(firstWord)) score -= 1;

  if (text.endsWith('?')) score += 0.5;
  if (text.includes('—')) score += 0.5;

  return Math.max(1, Math.min(10, Math.round(score)));
}

function scoreVisualPotentialRaw(text: string): number {
  let score = 5; // neutral baseline

  // Reward visual pattern signals
  const visualSignals = countVisualSignals(text);
  score += Math.min(visualSignals * 1.5, 4); // cap at +4

  // Reward concrete objects (can be shown)
  if (VISUAL_PATTERNS.concreteObjects.test(text)) score += 1;

  // Reward numbers (can be displayed as stats)
  if (VISUAL_PATTERNS.numbers.test(text)) score += 1;

  // Reward contrast structures (natural split-screen)
  if (VISUAL_PATTERNS.emDashContrast.test(text) || VISUAL_PATTERNS.contrast.test(text)) score += 0.5;

  // Reward scenario/outcome (implies sequence)
  if (VISUAL_PATTERNS.scenario.test(text) || VISUAL_PATTERNS.outcome.test(text)) score += 1;

  // Penalize abstract language
  if (isAbstract(text)) score -= 3;

  // Penalize purely philosophical statements
  const philosophical = ['is overrated', 'is underrated', 'is a myth', 'is a lie'];
  if (philosophical.some(p => text.toLowerCase().includes(p)) && !hasConcreteElement(text)) {
    score -= 1;
  }

  // Reward action/imperative hooks (demonstrate-able)
  if (VISUAL_PATTERNS.action.test(text)) score += 1;

  return Math.max(1, Math.min(10, Math.round(score)));
}

// ─── Public API ──────────────────────────────────────────────

export function scoreHook(text: string, allHooks: string[]): HookScores {
  const clarity = scoreClarityRaw(text);
  const originality = scoreOriginalityRaw(text, allHooks);
  const stoppingPower = scoreStoppingPowerRaw(text);
  const visualPotential = scoreVisualPotentialRaw(text);
  const average = Math.round(((clarity + originality + stoppingPower + visualPotential) / 4) * 10) / 10;

  return { clarity, originality, stoppingPower, visualPotential, average };
}

export function scoreAllHooks(hooks: Array<{ text: string; type: string; visualHint?: string }>): ScoredHook[] {
  const allTexts = hooks.map(h => h.text);
  return hooks.map(hook => {
    const scores = scoreHook(hook.text, allTexts);
    const flags: string[] = [];

    const lower = hook.text.toLowerCase();

    if (BANNED_OPENERS.some(b => lower.startsWith(b))) {
      flags.push('banned_opener');
    }

    if (GENERIC_PHRASES.some(p => lower.includes(p))) {
      flags.push('generic_phrase');
    }

    const words = hook.text.split(/\s+/);
    const vagueCount = words.filter(w => VAGUE_WORDS.includes(w.toLowerCase().replace(/[^a-z]/g, ''))).length;
    if (vagueCount >= 2) {
      flags.push('vague_language');
    }

    if (!hasConcreteElement(hook.text)) {
      flags.push('lacks_specificity');
    }

    if (!hasTension(hook.text)) {
      flags.push('lacks_tension');
    }

    if (scores.visualPotential < 6) {
      flags.push('low_visual_potential');
    }

    if (isAbstract(hook.text)) {
      flags.push('too_abstract');
    }

    if (scores.average < 7) {
      flags.push('below_quality_threshold');
    }

    // Generate visual hint if not already provided
    const visualHint = hook.visualHint || generateVisualHint(hook.text);

    return { text: hook.text, type: hook.type, visualHint, scores, flags };
  });
}

export interface DiversityReport {
  structureDistribution: Record<string, number>;
  startingWords: Record<string, number>;
  questionCount: number;
  declarativeCount: number;
  contrastCount: number;
  scenarioCount: number;
  outcomeCount: number;
  boldClaimCount: number;
  violations: string[];
}

export function checkDiversity(hooks: Array<{ text: string; type: string }>): DiversityReport {
  const violations: string[] = [];
  const startingWords: Record<string, number> = {};
  const structureCounts: Record<string, number> = {};

  let questionCount = 0;
  let declarativeCount = 0;
  let contrastCount = 0;
  let scenarioCount = 0;
  let outcomeCount = 0;
  let boldClaimCount = 0;

  for (const hook of hooks) {
    const text = hook.text;
    const lower = text.toLowerCase();
    const words = lower.split(/\s+/);

    const starter = words[0];
    startingWords[starter] = (startingWords[starter] || 0) + 1;

    const structKey = words.slice(0, 2).join(' ');
    structureCounts[structKey] = (structureCounts[structKey] || 0) + 1;

    // Classify format
    if (text.endsWith('?')) questionCount++;
    if (!/\byou(r|'re|'ve)?\b/i.test(text) && !text.endsWith('?')) declarativeCount++;
    if (text.includes('—') || /\sbut\s/.test(lower) || /\snot\s/.test(lower)) contrastCount++;
    if (VISUAL_PATTERNS.scenario.test(text)) scenarioCount++;
    if (VISUAL_PATTERNS.outcome.test(text)) outcomeCount++;
    if (/^[A-Z]/.test(text) && !text.endsWith('?') && text.split(/\s+/).length <= 8) boldClaimCount++;
  }

  // Check violations
  for (const [word, count] of Object.entries(startingWords)) {
    if (count > 2) {
      violations.push(`${count} hooks start with "${word}" (max 2 allowed)`);
    }
  }

  for (const [struct, count] of Object.entries(structureCounts)) {
    if (count > 2) {
      violations.push(`${count} hooks share structure "${struct}..." (max 2 allowed)`);
    }
  }

  if (questionCount < 3) violations.push(`Only ${questionCount} question hooks (need 3+)`);
  if (declarativeCount < 3) violations.push(`Only ${declarativeCount} declarative hooks (need 3+)`);
  if (contrastCount < 4) violations.push(`Only ${contrastCount} contrast hooks (need 4+)`);
  if (scenarioCount < 2) violations.push(`Only ${scenarioCount} scenario hooks (recommend 2+)`);

  return {
    structureDistribution: structureCounts,
    startingWords,
    questionCount,
    declarativeCount,
    contrastCount,
    scenarioCount,
    outcomeCount,
    boldClaimCount,
    violations,
  };
}

export function getWeakHookIndices(scored: ScoredHook[], threshold = 7, visualThreshold = 6): number[] {
  return scored
    .map((h, i) => ({ index: i, avg: h.scores.average, vis: h.scores.visualPotential }))
    .filter(h => h.avg < threshold || h.vis < visualThreshold)
    .sort((a, b) => a.avg - b.avg)
    .map(h => h.index);
}
