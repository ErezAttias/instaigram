export interface PatternSlideStructure {
  slideIndex: number;
  role: string;
  guidance: string;
}

export interface PostPatternDef {
  name: string;
  description: string;
  hookGuidance: string;
  slides: PatternSlideStructure[];
}

export const POST_PATTERNS: Record<string, PostPatternDef> = {
  CONTRAST: {
    name: 'Contrast',
    description: 'X vs Y — shows two sides of a coin',
    hookGuidance: 'Frame as a comparison or unexpected contrast. E.g., "X works. Y looks like it works."',
    slides: [
      { slideIndex: 0, role: 'HOOK', guidance: 'The contrast hook — present the tension between two things' },
      { slideIndex: 1, role: 'SETUP', guidance: 'Present Side A — the common approach or belief' },
      { slideIndex: 2, role: 'BUILD', guidance: 'Strengthen Side A — make it seem reasonable' },
      { slideIndex: 3, role: 'TWIST', guidance: 'Introduce Side B — the surprising counter-reality' },
      { slideIndex: 4, role: 'INSIGHT', guidance: 'Why Side B wins — the mechanism or evidence' },
      { slideIndex: 5, role: 'CTA', guidance: 'Which side are you on? Drive engagement through choice' },
    ],
  },
  MISTAKE: {
    name: 'Mistake',
    description: 'What people do wrong without realizing it',
    hookGuidance: 'Name the mistake directly. E.g., "You\'re doing this every day without noticing"',
    slides: [
      { slideIndex: 0, role: 'HOOK', guidance: 'Name the mistake boldly' },
      { slideIndex: 1, role: 'SETUP', guidance: 'Show the mistake in action — a relatable scenario' },
      { slideIndex: 2, role: 'BUILD', guidance: 'Explain WHY it\'s a mistake — the hidden mechanism' },
      { slideIndex: 3, role: 'TWIST', guidance: 'Show the consequence — what this mistake actually costs' },
      { slideIndex: 4, role: 'INSIGHT', guidance: 'The correction — what to do instead, specifically' },
      { slideIndex: 5, role: 'CTA', guidance: 'Save this to stop making this mistake' },
    ],
  },
  MYTH: {
    name: 'Myth Buster',
    description: 'Common belief vs reality',
    hookGuidance: 'Present the myth as something people believe. E.g., "This sounds smart but it\'s wrong"',
    slides: [
      { slideIndex: 0, role: 'HOOK', guidance: 'State the myth people believe' },
      { slideIndex: 1, role: 'SETUP', guidance: 'Why people believe this myth — it sounds logical' },
      { slideIndex: 2, role: 'BUILD', guidance: 'Show the evidence that it\'s wrong' },
      { slideIndex: 3, role: 'TWIST', guidance: 'The real truth — what actually works' },
      { slideIndex: 4, role: 'INSIGHT', guidance: 'How to apply the truth — specific action' },
      { slideIndex: 5, role: 'CTA', guidance: 'Share this with someone who still believes the myth' },
    ],
  },
  LIST: {
    name: 'List',
    description: 'Structured list with a twist',
    hookGuidance: 'Don\'t use "5 tips" format. Frame as discovery. E.g., "Things that secretly drain your reach"',
    slides: [
      { slideIndex: 0, role: 'HOOK', guidance: 'Set up the list with tension — not a boring "5 things"' },
      { slideIndex: 1, role: 'SETUP', guidance: 'Item 1 — the most surprising or relatable item' },
      { slideIndex: 2, role: 'BUILD', guidance: 'Item 2 — escalate in intensity or surprise' },
      { slideIndex: 3, role: 'TWIST', guidance: 'Item 3 — the unexpected one that reframes the list' },
      { slideIndex: 4, role: 'INSIGHT', guidance: 'Item 4 — the hardest truth, the one they resist' },
      { slideIndex: 5, role: 'CTA', guidance: 'The connecting thread + call to action' },
    ],
  },
  STORY: {
    name: 'Story',
    description: 'Mini narrative with insight',
    hookGuidance: 'Open with a scene or moment. E.g., "I deleted 47 posts in one night"',
    slides: [
      { slideIndex: 0, role: 'HOOK', guidance: 'The moment — a specific scene that draws you in' },
      { slideIndex: 1, role: 'SETUP', guidance: 'Context — what led to this moment' },
      { slideIndex: 2, role: 'BUILD', guidance: 'The turning point — what changed or broke' },
      { slideIndex: 3, role: 'TWIST', guidance: 'The realization — what you learned' },
      { slideIndex: 4, role: 'INSIGHT', guidance: 'The lesson — universalized for the reader' },
      { slideIndex: 5, role: 'CTA', guidance: 'What to do with this story — save, share, reflect' },
    ],
  },
  BREAKDOWN: {
    name: 'Breakdown',
    description: 'Step-by-step explanation of how something works',
    hookGuidance: 'Expose a mechanism. E.g., "Here\'s how the algorithm actually decides your reach"',
    slides: [
      { slideIndex: 0, role: 'HOOK', guidance: 'Name the mechanism or process to explain' },
      { slideIndex: 1, role: 'SETUP', guidance: 'Step 1 / Foundation — the starting point' },
      { slideIndex: 2, role: 'BUILD', guidance: 'Step 2 / The key mechanism — how it actually works' },
      { slideIndex: 3, role: 'TWIST', guidance: 'The part people get wrong — the counterintuitive step' },
      { slideIndex: 4, role: 'INSIGHT', guidance: 'How to use this knowledge — practical application' },
      { slideIndex: 5, role: 'CTA', guidance: 'Bookmark this breakdown for reference' },
    ],
  },
  OPINION: {
    name: 'Opinion',
    description: 'Strong stance with evidence',
    hookGuidance: 'Take a clear position. E.g., "This is the single biggest waste of time in content"',
    slides: [
      { slideIndex: 0, role: 'HOOK', guidance: 'State the opinion boldly — no hedging' },
      { slideIndex: 1, role: 'SETUP', guidance: 'Why this opinion matters right now' },
      { slideIndex: 2, role: 'BUILD', guidance: 'Evidence or example that supports the opinion' },
      { slideIndex: 3, role: 'TWIST', guidance: 'The counterargument — and why it\'s wrong' },
      { slideIndex: 4, role: 'INSIGHT', guidance: 'What this means for the reader specifically' },
      { slideIndex: 5, role: 'CTA', guidance: 'Agree or disagree? Drive comments' },
    ],
  },
};

// Distribution for 30 posts — ensures variety
export function getPatternDistribution(): string[] {
  // 30 posts across 7 patterns: roughly 4-5 each, shuffled
  const base = [
    'CONTRAST', 'CONTRAST', 'CONTRAST', 'CONTRAST', 'CONTRAST',
    'MISTAKE', 'MISTAKE', 'MISTAKE', 'MISTAKE',
    'MYTH', 'MYTH', 'MYTH', 'MYTH',
    'LIST', 'LIST', 'LIST', 'LIST',
    'STORY', 'STORY', 'STORY',
    'BREAKDOWN', 'BREAKDOWN', 'BREAKDOWN', 'BREAKDOWN',
    'OPINION', 'OPINION', 'OPINION', 'OPINION', 'OPINION',
  ];
  // Shuffle using Fisher-Yates
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base;
}

export function getPatternSlideGuidance(pattern: string): string {
  const def = POST_PATTERNS[pattern];
  if (!def) return '';
  return def.slides
    .map(s => `Slide ${s.slideIndex + 1} (${s.role}): ${s.guidance}`)
    .join('\n');
}

// ─── V2 Content-Strategy Patterns ────────────────────────────
// These define WHAT KINDS OF FACTS to mine, not how to structure a narrative.
// Each pattern steers the mining prompt toward a specific fact-selection strategy.

export interface ContentPatternDef {
  name: string;
  description: string;
  miningGuidance: string;
  exampleClaims: string[];
}

export const CONTENT_PATTERNS: Record<string, ContentPatternDef> = {
  SCALE: {
    name: 'Scale',
    description: 'Facts that reveal surprising size, quantity, or magnitude',
    miningGuidance: `Find facts where the NUMBER is the surprise. Look for:
- Things that are unexpectedly large or small
- Quantities that defy intuition
- Proportions and ratios that reframe understanding
- Costs, distances, durations, or populations that shock

Every fact must include at least one concrete number with a reference point for scale.`,
    exampleClaims: [
      'The Great Pacific Garbage Patch is twice the size of Texas',
      'A single Bitcoin transaction uses enough energy to power a US household for 72 days',
      'There are more possible chess games than atoms in the observable universe',
    ],
  },
  TIMELINE: {
    name: 'Timeline',
    description: 'Facts that trace evolution or mark surprising moments in time',
    miningGuidance: `Find facts anchored to specific DATES or TIME PERIODS. Look for:
- Events that happened surprisingly early or late
- Things that coexisted in the same era unexpectedly
- How long something took vs how long people assume
- Turning points that happened on a specific, nameable date

Every fact must include at least one year, date, or concrete time reference.`,
    exampleClaims: [
      'Oxford University is older than the Aztec Empire — it was teaching students by 1096',
      'Nintendo was founded in 1889, 56 years before the first computer was built',
      'Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid',
    ],
  },
  VERSUS: {
    name: 'Versus',
    description: 'Facts that contrast two things to reveal a surprising difference',
    miningGuidance: `Find facts that PIT TWO THINGS AGAINST EACH OTHER. Look for:
- Direct comparisons where one side wins unexpectedly
- Things assumed to be similar that are vastly different
- Things assumed to be different that are surprisingly similar
- Rankings where the winner is not who you'd expect

Every fact must name both sides of the comparison explicitly.`,
    exampleClaims: [
      'Honey badgers have thicker skin than buffalo — thick enough to resist machete strikes',
      'Finland has more saunas than cars — 3.3 million saunas for 5.5 million people',
      'A mantis shrimp punch accelerates faster than a .22 caliber bullet',
    ],
  },
  MECHANISM: {
    name: 'Mechanism',
    description: 'Facts that explain how something works in a surprising way',
    miningGuidance: `Find facts that reveal the HIDDEN MECHANISM behind something. Look for:
- Why something works the way it does (cause, not just effect)
- Counter-intuitive processes or chain reactions
- Physical, biological, or economic mechanisms people misunderstand
- The specific step or condition that makes something possible or impossible

Every fact must explain a cause-effect relationship, not just state an outcome.`,
    exampleClaims: [
      'Honey never spoils because its low moisture content starves bacteria and its acidity kills what survives',
      'Octopuses have three hearts — and one stops beating when they swim, which is why they prefer crawling',
      'Bananas are radioactive because they contain potassium-40, but you would need to eat 10 million to get radiation sickness',
    ],
  },
  MISCONCEPTION: {
    name: 'Misconception',
    description: 'Facts that correct widely believed but wrong claims',
    miningGuidance: `Find facts where the COMMON BELIEF IS WRONG. Look for:
- Things "everyone knows" that are actually false
- Oversimplified explanations that miss the real mechanism
- Historical "facts" that were invented or distorted
- Statistics that are widely cited but misleading or outdated

Every fact must state both the misconception AND the correction with evidence.`,
    exampleClaims: [
      'Goldfish have a memory span of at least 5 months, not 3 seconds — they can learn to navigate mazes',
      'The Great Wall of China is not visible from space with the naked eye — this myth was debunked by astronauts',
      'Napoleon was not short — at 5\'7" he was above average height for a Frenchman in the 1800s',
    ],
  },
  EXTREMES: {
    name: 'Extremes',
    description: 'Facts about records, outliers, and edge cases',
    miningGuidance: `Find facts about EXTREMES and OUTLIERS. Look for:
- World records, firsts, lasts, longest, shortest, biggest, smallest
- Edge cases that test the limits of a category
- Outlier individuals, events, or objects that break the pattern
- The most extreme version of something ordinary

Every fact must specify the exact record or extreme with a number or named holder.`,
    exampleClaims: [
      'Wilt Chamberlain averaged 48.5 minutes per game in the 1961-62 season — games are only 48 minutes long',
      'The longest hiccupping spree lasted 68 years — Charles Osborne hiccupped from 1922 to 1990',
      'Lake Baikal holds 20% of the world\'s unfrozen fresh water — more than all the Great Lakes combined',
    ],
  },
};

// Distribution for 30 posts across v2 patterns — ensures variety
export function getContentPatternDistribution(): string[] {
  const base = [
    'SCALE', 'SCALE', 'SCALE', 'SCALE', 'SCALE',
    'TIMELINE', 'TIMELINE', 'TIMELINE', 'TIMELINE', 'TIMELINE',
    'VERSUS', 'VERSUS', 'VERSUS', 'VERSUS', 'VERSUS',
    'MECHANISM', 'MECHANISM', 'MECHANISM', 'MECHANISM', 'MECHANISM',
    'MISCONCEPTION', 'MISCONCEPTION', 'MISCONCEPTION', 'MISCONCEPTION', 'MISCONCEPTION',
    'EXTREMES', 'EXTREMES', 'EXTREMES', 'EXTREMES', 'EXTREMES',
  ];
  // Shuffle using Fisher-Yates
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base;
}

// Returns mining guidance string for injection into the mine prompt
export function getPatternMiningGuidance(pattern: string): string {
  const def = CONTENT_PATTERNS[pattern];
  if (!def) return '';
  return `PATTERN: ${def.name} — ${def.description}

${def.miningGuidance}

EXAMPLE CLAIMS (for calibration — do not copy these, generate original facts):
${def.exampleClaims.map(c => `- "${c}"`).join('\n')}`;
}
