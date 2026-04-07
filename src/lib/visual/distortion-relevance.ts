/**
 * Distortion Relevance Evaluator
 *
 * Scores distortions on three axes:
 *   1. Visual strength  — how noticeable is the distortion?
 *   2. Semantic relevance — does it reinforce the headline's meaning?
 *   3. Uniqueness — how different is it from others in the batch?
 *
 * The core test: "If I remove the text, does the distorted element still
 * feel connected to the core idea of the headline?"
 *
 * A visually striking distortion that has no semantic link to the headline
 * is a random anomaly, not a visual argument. This module rejects those.
 */

import type { DistortionType } from './distortion';
import type { HeadlineTension } from './intent';

// ─── Types ───────────────────────────────────────────────────────

export interface RelevanceScore {
  /** 0–10: how immediately visible / eye-catching the distortion is */
  visualStrength: number;
  /** 0–10: how well the distortion reinforces the headline's meaning */
  semanticRelevance: number;
  /** 0–10: how different this distortion is from others in the batch */
  uniqueness: number;
  /** Weighted composite score (0–10) */
  composite: number;
  /** Whether this variation passes the quality threshold */
  accepted: boolean;
  /** Human-readable explanation of the score */
  reasoning: string;
  /** Specific reasons for rejection (empty if accepted) */
  rejectionReasons: string[];
}

export interface RelevanceInput {
  /** The distortion description text (sceneInjection) */
  distortionText: string;
  /** The distortion type */
  distortionType: DistortionType;
  /** The original headline (not the tension-modified rewrite) */
  headline: string;
  /** Detected tension type */
  tensionType: HeadlineTension['type'];
  /** Topic domain */
  topic: string;
  /** Composition framing name */
  framing: string;
}

// ─── Semantic Concept Mapping ───────────────────────────────────
//
// Maps headline concepts (what the hook is ABOUT) to distortion
// concepts (what the visual SHOWS). A strong distortion makes the
// same argument the headline makes, but visually.
//
// Structure: headline keyword → distortion keywords that REINFORCE it.

const CONCEPT_BRIDGES: Array<{
  /** Headline keywords that activate this bridge */
  headlineSignals: RegExp;
  /** Distortion description keywords that reinforce the headline */
  distortionSignals: string[];
  /** What makes this pairing semantically strong */
  rationale: string;
  /** Bonus score for this match (added to semantic relevance) */
  bonus: number;
}> = [
  // ─── TRUE OBSOLESCENCE / REPLACEMENT ───────────────────
  // The distortion argues: "your work/skill/role is hollow, empty, or no longer needed."
  // These are the STRONG signals for replacement headlines.
  {
    headlineSignals: /\b(replace|obsolete|automat|disappear|end|dead|dying|never|outperform|redundant)\b/i,
    distortionSignals: [
      'blank', 'empty', 'nothing', 'staring at nothing',
      'visibly blank', 'hollow', 'meaningless', 'useless',
      'turned-off', 'dead', 'dark monitor', 'dead screen',
      'stuck', 'broken under', 'no longer',
      'produced nothing', 'no answer', 'no output',
      '404', 'error page', 'cursor.*empty', 'blinking cursor',
      'identical.*output', 'repeated', 'same.*line',
      'redacted', 'emptied out', 'made meaningless',
      'rejected', 'red x', 'erased',
      'connected to nothing', 'typing into.*air',
      'snapped off', 'can never be delivered',
      'does not exist', 'empty desk', 'no sign anyone',
      'already.*answered', 'already.*decided', 'arrive too late',
    ],
    rationale: 'obsolescence → emptiness where value should be, work becoming hollow, output that is void',
    bonus: 4,
  },
  // ─── DISCONNECTION / BEING CUT OFF ─────────────────────
  // The distortion argues: "you have been severed from the system you depended on."
  // Strong for replacement: the person is separated from their tools/purpose.
  {
    headlineSignals: /\b(replace|obsolete|automat|disappear|end|dead|dying|never|outperform|redundant|fire|laid off)\b/i,
    distortionSignals: [
      'severed', 'disconnected', 'cut', 'removed', 'unplugged',
      'pulled.*out', 'cable.*out', 'gone', 'vanish',
      'snapped off', 'bare.*desk', 'no monitor', 'no screen', 'no machine',
      'connected to nothing',
    ],
    rationale: 'disconnection → being cut off from the system, separated from purpose',
    bonus: 3,
  },
  // ─── COMPETENCE GAP / FUTILE EFFORT ────────────────────
  // The distortion argues: "the person is trying but their effort is pointless."
  // The keyboard is broken, the page is blank, the tool doesn't work.
  {
    headlineSignals: /\b(replace|obsolete|automat|never|outperform|redundant|useless|pointless|futile)\b/i,
    distortionSignals: [
      'broken.*finger', 'stuck.*key', 'pushed.*inward',
      'pressed.*hard', 'reading.*blank', 'staring.*nothing',
      'holding.*blank', 'grip.*severed', 'reaching.*not yet',
      'producing nothing', 'produced nothing', 'no answer',
      'identical.*output', 'same.*line.*repeated', 'useless output',
      'redacted.*bar', 'content.*emptied',
      'error.*before.*act', 'decided before', 'already.*answered',
      'too late', 'typing.*nothing', 'keyboard.*nothing',
      '404.*error', 'work.*rejected',
    ],
    rationale: 'competence gap → effort applied to broken or empty tools, futile work, output that is void or preempted',
    bonus: 3,
  },
  // ─── Hidden Truth / Deception ──────────────────────────
  {
    headlineSignals: /\b(hidden|secret|real|truth|bias|lie|fake|fraud|actual|beneath|under)\b/i,
    distortionSignals: [
      'reflection', 'mirror', 'contradicts', 'opposite', 'different',
      'underneath', 'behind', 'inside', 'masked', 'closed.*open',
      'open.*closed', 'calm.*strained', 'composed.*shouting',
      'surface', 'window', 'reversed',
    ],
    rationale: 'hidden truth → reflection mismatches, things that look different than they are',
    bonus: 3,
  },
  // ─── Destruction / Collapse ────────────────────────────
  {
    headlineSignals: /\b(destroy|kill|crash|collapse|break|shatter|ruin|fail|fall)\b/i,
    distortionSignals: [
      'break', 'crack', 'shatter', 'torn', 'rip', 'snap', 'impact',
      'strike', 'smash', 'crumbl', 'collaps', 'bent', 'deform',
      'splinter', 'puncture',
    ],
    rationale: 'destruction → things breaking, tearing, collapsing on the subject',
    bonus: 3,
  },
  // ─── Control / Power ───────────────────────────────────
  {
    headlineSignals: /\b(control|power|dominate|manipulat|grip|force|pressure|trap)\b/i,
    distortionSignals: [
      'grip', 'clench', 'squeeze', 'press', 'tension', 'tight',
      'force', 'white.*knuckle', 'holding', 'trapped', 'locked',
      'pushed', 'pinned', 'restrained',
    ],
    rationale: 'control → physical tension, gripping, constraint on the subject',
    bonus: 3,
  },
  // ─── Transformation / Change ───────────────────────────
  {
    headlineSignals: /\b(transform|change|become|evolve|shift|transition|morph|unlock|upgrade)\b/i,
    distortionSignals: [
      'half', 'split', 'one side', 'shedding', 'emerging', 'mid-',
      'between', 'transition', 'threshold', 'two', 'separating',
      'opening', 'releasing', 'letting go',
    ],
    rationale: 'transformation → things mid-change, split states, thresholds',
    bonus: 3,
  },
  // ─── Knowledge / Decision ──────────────────────────────
  {
    headlineSignals: /\b(decision|choice|think|know|learn|understand|cognitive|brain|mind|bias)\b/i,
    distortionSignals: [
      'eye', 'stare', 'gaze', 'look', 'focus', 'read', 'study',
      'blink', 'pupil', 'expression', 'face', 'forehead', 'brow',
      'hands.*face', 'head', 'temple', 'furrowed',
    ],
    rationale: 'cognition → eyes, facial tension, the visible weight of thought',
    bonus: 2,
  },
  // ─── Money / Value ─────────────────────────────────────
  {
    headlineSignals: /\b(money|wealth|rich|poor|cost|price|invest|profit|lose|gain|worth)\b/i,
    distortionSignals: [
      'money', 'bill', 'coin', 'currency', 'sign', 'document',
      'contract', 'paper', 'ink', 'vault', 'bank', 'calculator',
      'zero', 'blank.*bill', 'red.*ink',
    ],
    rationale: 'money → physical currency, documents, financial objects on the subject',
    bonus: 3,
  },
  // ─── Speed / Time ──────────────────────────────────────
  {
    headlineSignals: /\b(fast|slow|time|moment|instant|second|quick|hurry|urgent|deadline|late|early)\b/i,
    distortionSignals: [
      'frozen', 'mid-', 'instant', 'millisecond', 'caught',
      'blur', 'tipping', 'falling', 'suspended', 'half-',
      'peak.*moment', 'irreversible',
    ],
    rationale: 'time pressure → frozen moments, things caught mid-action',
    bonus: 2,
  },
  // ─── Identity / Self ───────────────────────────────────
  {
    headlineSignals: /\b(you|your|self|identity|who|person|human|individual)\b/i,
    distortionSignals: [
      'reflection', 'mirror', 'shadow', 'face', 'eye', 'hand',
      'body', 'posture', 'expression', 'portrait',
    ],
    rationale: 'self-reference → reflections, body, personal physical presence',
    bonus: 1,
  },
];

// ─── Distortion Type ↔ Tension Semantic Fit ─────────────────────
//
// Some distortion types are inherently better arguments for certain
// tension types. A reflection-mismatch is a natural argument for
// "hidden truth" but a weak argument for "speed."

const TYPE_TENSION_FIT: Record<DistortionType, Record<HeadlineTension['type'], number>> = {
  'reflection-mismatch': {
    contrast: 9,       // reflection = two realities = contrast
    revelation: 9,     // reflection shows hidden truth
    challenge: 6,      // shows the "wrong" version
    threat: 4,         // weak: reflection ≠ threat
    transformation: 5, // partial: two states visible
    neutral: 3,
  },
  'physical-inconsistency': {
    threat: 8,         // broken/wrong = something went wrong = threat
    challenge: 8,      // wrong state = challenge to correctness
    contrast: 6,       // inconsistency is a form of contrast
    revelation: 5,     // wrong state reveals hidden truth
    transformation: 4, // weak: inconsistency ≠ change
    neutral: 3,
  },
  'temporal-tension': {
    threat: 5,         // frozen before impact = dramatic, but often generic (lowered from 9)
    transformation: 5, // mid-action = mid-change, but often accidental (lowered from 7)
    challenge: 4,      // frozen commitment
    contrast: 3,       // weak: frozen moment ≠ contrast
    revelation: 3,     // weak
    neutral: 2,
  },
  'scale-imbalance': {
    threat: 6,         // dwarfing = overwhelming
    revelation: 6,     // magnified detail reveals hidden
    contrast: 7,       // large vs small = visual contrast
    challenge: 5,
    transformation: 4,
    neutral: 3,
  },
};

// ─── Semantic Penalties ─────────────────────────────────────────
//
// Penalty rules detect distortions that are visually dramatic but
// semantically disconnected from the headline's specific claim.
//
// The test: "Does this distortion argue for the headline, or does it
// just argue that 'something bad is happening'?"
//
// A coffee spill argues "disruption." A blank code page argues
// "your work is hollow." Only the second one argues for replacement.

interface SemanticPenalty {
  /** When this penalty applies (headline must match) */
  headlineSignals: RegExp;
  /** Distortion description patterns that trigger the penalty */
  distortionPatterns: RegExp;
  /** Score penalty (subtracted from semantic relevance) */
  penalty: number;
  /** What this catches */
  rationale: string;
}

const SEMANTIC_PENALTIES: SemanticPenalty[] = [
  // ─── Generic accident in replacement context ───────────
  // Coffee spills, random falls, button presses — these are dramatic
  // but don't argue "you are being replaced by something better."
  {
    headlineSignals: /\b(replace|obsolete|automat|never|outperform|redundant)\b/i,
    distortionPatterns: /\b(coffee|tea|cup|liquid|spill|pour|tipping off|drink|beverage|mug)\b/i,
    penalty: 4,
    rationale: 'Generic accident: spilling a drink is disruption, not replacement. Nothing about a coffee spill argues that a more capable actor is taking over.',
  },
  {
    headlineSignals: /\b(replace|obsolete|automat|never|outperform|redundant)\b/i,
    distortionPatterns: /\b(button|switch|pressing.*button|half-depressed|pressing.*red)\b/i,
    penalty: 2,
    rationale: 'Generic action: pressing a button is a moment of commitment, not obsolescence. It shows agency, which is the opposite of being replaced.',
  },
  {
    headlineSignals: /\b(replace|obsolete|automat|never|outperform|redundant)\b/i,
    distortionPatterns: /\b(sparks?|spark.*air|shower.*sparks|frozen.*sparks)\b/i,
    penalty: 2,
    rationale: 'Generic drama: sparks are visual spectacle, not a semantic argument for replacement. They communicate "danger" not "obsolescence."',
  },
  // ─── Physical destruction without hollowness ───────────
  // Breaking things communicates violence, not being outperformed.
  // Exception: breaking tools/work outputs (those DO argue for futility).
  {
    headlineSignals: /\b(replace|obsolete|automat|never|outperform|redundant)\b/i,
    distortionPatterns: /\b(fist.*strike|fist.*table|fist.*mid-strike|punch|smash|slam)\b/i,
    penalty: 2,
    rationale: 'Frustration, not obsolescence: smashing things argues "angry" not "being replaced." The subject still has agency.',
  },
];

// ─── Visual Strength Scoring ────────────────────────────────────

const VISUAL_STRENGTH_SIGNALS: Array<{ pattern: RegExp; score: number }> = [
  // Strong focal language
  { pattern: /\bcentral\s*visual\b/i, score: 2 },
  { pattern: /\bfirst\s*thing\b/i, score: 2 },
  { pattern: /\bsharp\s*focus\b|pin-sharp|razor/i, score: 1 },
  { pattern: /\bfilling\s*(the\s*)?frame\b/i, score: 1 },
  // Physical impact language
  { pattern: /\bextreme\s*close-up\b/i, score: 1 },
  { pattern: /\bvisib(le|ly)\b/i, score: 1 },
  { pattern: /\bimmediately\b/i, score: 1 },
  // Contrast/drama language
  { pattern: /\bwhile\b.*\b(real|actual|opposite)\b/i, score: 1 },
  { pattern: /\bcontradicts?\b/i, score: 1 },
  { pattern: /\bfrozen\b/i, score: 1 },
];

function scoreVisualStrength(distortionText: string, framing: string): number {
  let score = 4; // Base score — all distortions in the vocabulary are designed to be visible

  for (const { pattern, score: bonus } of VISUAL_STRENGTH_SIGNALS) {
    if (pattern.test(distortionText)) {
      score += bonus;
    }
  }

  // Framing modifier: close-up amplifies visual impact
  if (framing === 'close-up') score += 1;
  if (framing === 'wide') score -= 1;

  return Math.min(10, Math.max(0, score));
}

// ─── Semantic Relevance Scoring ─────────────────────────────────

function scoreSemanticRelevance(
  distortionText: string,
  distortionType: DistortionType,
  headline: string,
  tensionType: HeadlineTension['type'],
): { score: number; matchedBridges: string[]; penalties: string[]; reasoning: string } {
  const matchedBridges: string[] = [];
  const penalties: string[] = [];
  let bridgeScore = 0;

  // 1. Concept bridge matching — does the distortion's vocabulary
  //    connect to the headline's semantic field?
  const lowerDistortion = distortionText.toLowerCase();
  const lowerHeadline = headline.toLowerCase();

  for (const bridge of CONCEPT_BRIDGES) {
    const headlineMatch = bridge.headlineSignals.test(lowerHeadline);
    if (!headlineMatch) continue;

    const distortionMatch = bridge.distortionSignals.some(signal => {
      if (signal.includes('.*')) {
        return new RegExp(signal, 'i').test(lowerDistortion);
      }
      return lowerDistortion.includes(signal);
    });

    if (distortionMatch) {
      matchedBridges.push(bridge.rationale);
      bridgeScore += bridge.bonus;
    }
  }

  // 2. Semantic penalties — detect distortions that are dramatic but
  //    semantically disconnected from the headline's specific claim.
  let penaltyScore = 0;
  for (const penalty of SEMANTIC_PENALTIES) {
    if (penalty.headlineSignals.test(lowerHeadline) && penalty.distortionPatterns.test(lowerDistortion)) {
      penaltyScore += penalty.penalty;
      penalties.push(penalty.rationale);
    }
  }

  // 3. Type-tension structural fit — is this distortion type a natural
  //    argument for this kind of headline tension?
  const typeFit = TYPE_TENSION_FIT[distortionType]?.[tensionType] ?? 3;

  // 4. Combine: bridges (0–13) + type fit scaled (0–4) - penalties → normalize to 0–10
  const rawScore = bridgeScore + (typeFit * 0.4) - penaltyScore;
  const normalizedScore = Math.min(10, Math.max(0, Math.round(rawScore * 10) / 10));

  // Build reasoning
  const reasoningParts: string[] = [];
  if (matchedBridges.length > 0) {
    reasoningParts.push(`Matched ${matchedBridges.length} bridge(s): ${matchedBridges.join('; ')}`);
  } else {
    reasoningParts.push('No concept bridge matched');
  }
  reasoningParts.push(`Type-tension fit: ${typeFit}/9`);
  if (penalties.length > 0) {
    reasoningParts.push(`PENALTIES (${penalties.length}): ${penalties.join('; ')}`);
  }

  return { score: normalizedScore, matchedBridges, penalties, reasoning: reasoningParts.join('. ') };
}

// ─── Uniqueness Scoring ─────────────────────────────────────────

/**
 * Score uniqueness by comparing this distortion against all others
 * in the batch. Measures both type diversity and description diversity.
 */
function scoreUniqueness(
  distortionText: string,
  distortionType: DistortionType,
  allDistortions: Array<{ text: string; type: DistortionType }>,
  currentIndex: number,
): number {
  if (allDistortions.length <= 1) return 10;

  const others = allDistortions.filter((_, i) => i !== currentIndex);

  // Type uniqueness: how many others share the same type?
  const sameTypeCount = others.filter(d => d.type === distortionType).length;
  const typeUniqueness = 1 - (sameTypeCount / others.length);

  // Text uniqueness: word overlap with other distortions
  const myWords = new Set(distortionText.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  let maxOverlap = 0;

  for (const other of others) {
    const otherWords = new Set(other.text.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    let overlap = 0;
    myWords.forEach(w => { if (otherWords.has(w)) overlap++; });
    const overlapRatio = myWords.size > 0 ? overlap / myWords.size : 0;
    maxOverlap = Math.max(maxOverlap, overlapRatio);
  }
  const textUniqueness = 1 - maxOverlap;

  // Weighted: type diversity matters slightly more
  const score = (typeUniqueness * 0.4 + textUniqueness * 0.6) * 10;
  return Math.min(10, Math.max(0, Math.round(score * 10) / 10));
}

// ─── Main Evaluator ─────────────────────────────────────────────

/** Minimum composite score to accept a variation */
const ACCEPTANCE_THRESHOLD = 4.5;

/** Score weights for composite calculation */
const WEIGHTS = {
  visualStrength: 0.2,
  semanticRelevance: 0.6,  // Semantic relevance dominates
  uniqueness: 0.2,
};

/**
 * Score a single distortion variation.
 */
export function scoreDistortionRelevance(
  input: RelevanceInput,
  allDistortions: Array<{ text: string; type: DistortionType }>,
  currentIndex: number,
): RelevanceScore {
  const visualStrength = scoreVisualStrength(input.distortionText, input.framing);

  const semantic = scoreSemanticRelevance(
    input.distortionText,
    input.distortionType,
    input.headline,
    input.tensionType,
  );

  const uniqueness = scoreUniqueness(
    input.distortionText,
    input.distortionType,
    allDistortions,
    currentIndex,
  );

  const composite = Math.round((
    visualStrength * WEIGHTS.visualStrength +
    semantic.score * WEIGHTS.semanticRelevance +
    uniqueness * WEIGHTS.uniqueness
  ) * 10) / 10;

  // Rejection logic
  const rejectionReasons: string[] = [];

  if (semantic.score < 2) {
    rejectionReasons.push(`Semantic relevance critically low (${semantic.score}/10): distortion is a random anomaly, not a visual argument for the headline.`);
  }

  if (semantic.score < 4 && visualStrength >= 7) {
    rejectionReasons.push(`Eye-catching but meaningless: visual strength ${visualStrength}/10 but semantic relevance only ${semantic.score}/10. The distortion distracts from the headline rather than reinforcing it.`);
  }

  if (semantic.penalties.length > 0 && semantic.score < 5) {
    rejectionReasons.push(`Penalized: ${semantic.penalties[0]}`);
  }

  if (uniqueness < 2) {
    rejectionReasons.push(`Near-duplicate: too similar to another variation in the batch (uniqueness ${uniqueness}/10).`);
  }

  const accepted = rejectionReasons.length === 0 && composite >= ACCEPTANCE_THRESHOLD;

  // Build reasoning summary
  const parts = [
    `Visual: ${visualStrength}/10`,
    `Semantic: ${semantic.score}/10`,
    `Unique: ${uniqueness}/10`,
    `→ Composite: ${composite}/10`,
  ];
  if (semantic.matchedBridges.length > 0) {
    parts.push(`Bridges: ${semantic.matchedBridges.join('; ')}`);
  }
  if (!accepted) {
    parts.push(`REJECTED: ${rejectionReasons.join(' ')}`);
  }

  return {
    visualStrength,
    semanticRelevance: semantic.score,
    uniqueness,
    composite,
    accepted,
    reasoning: parts.join(' | '),
    rejectionReasons,
  };
}

/**
 * Score an entire batch of variations and return ranked results.
 * Accepted variations are sorted by composite score (highest first).
 * Rejected variations are appended at the end.
 */
export function rankVariations<T extends { score: RelevanceScore }>(
  variations: T[],
): { accepted: T[]; rejected: T[]; all: T[] } {
  const accepted = variations
    .filter(v => v.score.accepted)
    .sort((a, b) => b.score.composite - a.score.composite);

  const rejected = variations
    .filter(v => !v.score.accepted)
    .sort((a, b) => b.score.composite - a.score.composite);

  return { accepted, rejected, all: [...accepted, ...rejected] };
}

export { CONCEPT_BRIDGES, TYPE_TENSION_FIT, SEMANTIC_PENALTIES, ACCEPTANCE_THRESHOLD, WEIGHTS };
