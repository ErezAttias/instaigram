/**
 * Lightweight deterministic topic classifier.
 * Routes topics to the appropriate grounding mode: news, knowledge, or mixed.
 *
 * Classification strategy (scored, not just keyword matching):
 *   1. Check for strong news signals → news
 *   2. Check for strong knowledge signals → knowledge
 *   3. If both signals present → mixed
 *   4. Default → knowledge (safer: Wikipedia always available, no API key needed)
 */

export type GroundingMode = 'news' | 'knowledge' | 'mixed';

/**
 * Content mode for hook generation.
 * - 'fact': Evergreen fact-based content (animal facts, history facts, science facts).
 *           Hooks must be timeless, no news/event framing.
 * - 'general': All other topics. May include news, opinions, trends.
 */
export type TopicContentMode = 'fact' | 'general';

/**
 * Explicit content intent — set at angle generation time, stored on Channel and NicheOption.
 * This replaces regex-based inference (isFactTopic) as the source of truth.
 */
export type ContentIntent = 'evergreen_fact' | 'story' | 'general';

/**
 * Derive the pipeline's TopicContentMode from an explicit ContentIntent.
 * If contentIntent is not yet set (null/undefined), falls back to the legacy
 * isFactTopic() classifier for backward compatibility.
 */
export function contentModeFromIntent(
  contentIntent: string | null | undefined,
  fallbackTopic?: string,
  fallbackExploreTopic?: string,
): TopicContentMode {
  if (contentIntent === 'evergreen_fact') return 'fact';
  if (contentIntent === 'story' || contentIntent === 'general') return 'general';

  // Backward compatibility: no contentIntent set yet → use legacy classifier
  const topicIsFact = fallbackTopic ? isFactTopic(fallbackTopic) : false;
  const exploreIsFact = fallbackExploreTopic ? isFactTopic(fallbackExploreTopic) : false;
  return (topicIsFact || exploreIsFact) ? 'fact' : 'general';
}

export interface ClassificationResult {
  mode: GroundingMode;
  contentMode: TopicContentMode;
  reason: string;
  newsScore: number;
  knowledgeScore: number;
}

// ─── Signal definitions ──────────────────────────────────────

interface Signal {
  pattern: RegExp;
  weight: number;
}

const NEWS_SIGNALS: Signal[] = [
  // Explicit recency markers
  { pattern: /\b(latest|trending|breaking|update|recent|today|this week|this month)\b/i, weight: 3 },
  // Markets / finance (inherently time-sensitive)
  { pattern: /\b(stock market|crypto|bitcoin|ethereum|forex|trading|earnings|ipo|nasdaq|s&p|dow jones)\b/i, weight: 3 },
  { pattern: /\b(investing|fintech|venture capital|funding round|series [a-d])\b/i, weight: 2 },
  // Sports events
  { pattern: /\b(nfl|nba|mlb|nhl|premier league|champions league|world cup|olympics|playoffs|season|transfer window)\b/i, weight: 3 },
  // Politics / policy
  { pattern: /\b(election|campaign|congress|parliament|legislation|regulation|sanctions|executive order)\b/i, weight: 2 },
  { pattern: /\b(democrat|republican|senate|house of representatives|supreme court ruling)\b/i, weight: 2 },
  // Tech industry current events
  { pattern: /\b(product launch|startup|layoffs|acquisition|merger|tech industry|silicon valley)\b/i, weight: 2 },
  { pattern: /\b(ai news|ai regulation|chatgpt|openai|google ai|apple event)\b/i, weight: 2 },
  // Entertainment current
  { pattern: /\b(box office|album release|concert tour|grammy|oscar|emmy|golden globe|awards show)\b/i, weight: 2 },
  // Virality / social
  { pattern: /\b(viral|controversy|scandal|drama|backlash|outrage)\b/i, weight: 2 },
  // News-specific framing
  { pattern: /\b(news|headline|report|announced|revealed|confirmed)\b/i, weight: 1 },
];

const KNOWLEDGE_SIGNALS: Signal[] = [
  // Academic / historical
  { pattern: /\b(history|historical|ancient|medieval|classical|century|era|civilization|dynasty)\b/i, weight: 3 },
  { pattern: /\b(mythology|myth|legend|folklore|epic|pantheon)\b/i, weight: 3 },
  // Science / nature
  { pattern: /\b(biology|physics|chemistry|astronomy|geology|evolution|quantum|relativity)\b/i, weight: 3 },
  { pattern: /\b(species|organism|ecosystem|planet|galaxy|element|molecule|theorem)\b/i, weight: 2 },
  // Philosophy / theory
  { pattern: /\b(philosophy|ethics|metaphysics|epistemology|logic|stoicism|existentialism)\b/i, weight: 3 },
  // Arts / literature (established)
  { pattern: /\b(renaissance|baroque|impressionism|modernism|surrealism|romanticism)\b/i, weight: 3 },
  { pattern: /\b(novel|literary|shakespeare|homer|dante|poetry|playwright)\b/i, weight: 2 },
  // Geography / culture
  { pattern: /\b(geography|continent|ocean|mountain range|desert|rainforest|tundra)\b/i, weight: 2 },
  { pattern: /\b(culture|tradition|religion|ritual|ceremony|heritage)\b/i, weight: 2 },
  // Math / CS fundamentals
  { pattern: /\b(algorithm|data structure|calculus|algebra|geometry|statistics|probability)\b/i, weight: 2 },
  { pattern: /\b(programming language|compiler|operating system|database theory)\b/i, weight: 2 },
  // Psychology / social science
  { pattern: /\b(psychology|cognitive|behavioral|neuroscience|sociology|anthropology|linguistics)\b/i, weight: 2 },
  // Medicine / health (established knowledge)
  { pattern: /\b(anatomy|physiology|pathology|pharmacology|immunology|genetics)\b/i, weight: 2 },
  // Cooking / crafts / how-to (stable knowledge)
  { pattern: /\b(recipe|cooking technique|fermentation|brewing|woodworking|knitting)\b/i, weight: 2 },
  // General knowledge indicators
  { pattern: /\b(explained|fundamentals|principles|theory|concept|definition|overview)\b/i, weight: 1 },
];

// ─── Topics that are inherently mixed ────────────────────────
// These benefit from both stable knowledge AND current events.

const MIXED_SIGNALS: Signal[] = [
  { pattern: /\b(artificial intelligence|machine learning|deep learning)\b/i, weight: 2 },
  { pattern: /\b(climate change|global warming|sustainability|renewable energy)\b/i, weight: 2 },
  { pattern: /\b(space exploration|nasa|spacex|mars mission)\b/i, weight: 2 },
  { pattern: /\b(cryptocurrency|blockchain|web3|defi)\b/i, weight: 1 }, // more news, but has knowledge base
  { pattern: /\b(electric vehicles|ev|tesla|autonomous driving)\b/i, weight: 1 },
  { pattern: /\b(pandemic|vaccine|public health|who)\b/i, weight: 1 },
];

// ─── Fact-topic patterns ─────────────────────────────────────
// Topics that are inherently evergreen, fact-based content.
// These should NEVER generate news/event-style hooks.

const FACT_TOPIC_PATTERNS: RegExp[] = [
  // Explicit "X facts" pattern
  /\b\w+\s+facts?\b/i,
  // Specific fact domains with qualifiers
  /\b(animal|wildlife|nature|ocean|marine|insect|bird|reptile|mammal|fish|plant|tree|fungus|fungi)\s*(facts?|trivia|knowledge|world|kingdom)\b/i,
  /\b(science|space|astronomy|geology|biology|chemistry|physics|anatomy|weather)\s*(facts?|trivia|knowledge)\b/i,
  /\b(history|historical|ancient|medieval)\s*(facts?|trivia|knowledge)\b/i,
  /\b(geography|country|world|earth|ocean|mountain)\s*(facts?|trivia|knowledge)\b/i,
  /\b(food|nutrition|cooking|culinary)\s*(facts?|trivia|knowledge|science)\b/i,
  /\b(psychology|brain|human body|language)\s*(facts?|trivia|knowledge)\b/i,
  // "Did you know" / trivia / fun facts framing
  /\b(fun facts?|trivia|fascinating facts?|weird facts?|cool facts?|random facts?)\b/i,
  // Nature/wildlife education channels
  /\b(wildlife education|nature education|animal education|science education)\b/i,
  // Standalone nature/animal/science topics — inherently fact-based even without "facts" suffix
  /^(animals?|wildlife|nature|ocean life|marine life|insects?|birds?|reptiles?|mammals?|fish|plants?|trees?|fungi|sea creatures?|dinosaurs?)$/i,
  /^(science|space|astronomy|geology|biology|chemistry|physics|anatomy|weather|evolution|ecology|botany|zoology)$/i,
  /^(history|ancient history|world history|medieval history|mythology|archaeology)$/i,
  /^(geography|earth|the ocean|the deep sea|volcanoes?|earthquakes?)$/i,
  /^(human body|the brain|psychology|neuroscience|genetics)$/i,
  // Angle-style fact topics — creative names for fact-based content
  // These catch explored angle titles that are clearly about fact-based domains
  /\b(weird|strange|bizarre|surprising|unbelievable|mind-blowing|shocking|insane|wild)\s+(animal|wildlife|nature|ocean|marine|science|space|history|body|brain|planet|species)\b/i,
  /\b(animal|wildlife|nature|ocean|marine|science|space|history|body|brain|planet|species)\s+(secrets?|mysteries|myths?|misconceptions?|truths?|lies|myth-?busting|debunked)\b/i,
  /\b(hidden|secret|unknown|forgotten|overlooked)\s+(animal|wildlife|nature|ocean|science|history|biology)\b/i,
];

/**
 * @deprecated Use contentIntent from Channel/NicheOption instead.
 * Kept only as a backward-compatibility fallback when contentIntent is not yet set.
 * Do NOT add new call sites — all new code should use contentModeFromIntent().
 */
export function isFactTopic(topic: string): boolean {
  return FACT_TOPIC_PATTERNS.some(p => p.test(topic));
}

// ─── Domain Style Classification ─────────────────────────────
//
// Two generation modes for copy and visual:
//   - 'narrative': mythology, history, crime, legendary events → flowing paragraph, drama, peak moment
//   - 'informational': animals, sharks, science, nature, space → mechanism, behavior, surprising explanation
//
// This drives how facts are mined, composed, and visualized.

export type TopicDomainStyle = 'narrative' | 'informational';

const NARRATIVE_PATTERNS: RegExp[] = [
  /\b(mythology|myth|myths|mythological|legend|legends|legendary|folklore|epic)\b/i,
  /\b(history|historical|ancient history|medieval|empire|dynasty|civilization)\b/i,
  /\b(crimes?|criminals?|murders?|heists?|assassinations?|serial killers?|true crime|unsolved)\b/i,
  /\b(wars?|battles?|sieges?|revolutions?|rebellions?|conquests?|invasions?)\b/i,
  /\b(god|gods|goddess|goddesses|deity|deities|titan|titans|demigod|olympus|pantheon)\b/i,
  /\b(pharaoh|emperor|king|queen|gladiator|samurai|viking|knight)\b/i,
  // Celebrity / public figure topics use narrative (portrait-driven) framing
  /\b(singer|musician|rapper|actor|actress|celebrity|performer|band|athlete|footballer|director|filmmaker|composer|songwriter|comedian|entertainer|influencer)\b/i,
  /\b(pop star|rock star|music artist|music facts)\b/i,
];

const INFORMATIONAL_PATTERNS: RegExp[] = [
  /\b(animal|animals|wildlife|species|predator|prey|marine|insect|bird|reptile|mammal|fish)\b/i,
  /\b(shark|sharks|whale|whales|dolphin|dolphins|octopus|jellyfish)\b/i,
  /\b(science|scientific|biology|chemistry|physics|astronomy|geology|evolution)\b/i,
  /\b(nature|natural|ecosystem|habitat|biome|rainforest|ocean|deep sea)\b/i,
  /\b(space|planet|star|galaxy|asteroid|comet|nasa|universe|solar system)\b/i,
  /\b(human body|anatomy|brain|genetics|cells|immune|organ|dna)\b/i,
  /\b(weather|climate|volcano|earthquake|tornado|hurricane)\b/i,
  /\b(plant|plants|tree|trees|fungus|fungi|botany|flower)\b/i,
];

/**
 * Classify a topic into narrative or informational domain style.
 *
 * Narrative domains use flowing paragraph framing with causal connectives.
 * Informational domains use mechanism/behavior framing (headline + explanation).
 *
 * Default: informational (safer — avoids forcing drama on fact topics).
 */
export function classifyDomainStyle(topic: string): TopicDomainStyle {
  const lower = topic.toLowerCase();

  let narrativeScore = 0;
  let informationalScore = 0;

  for (const p of NARRATIVE_PATTERNS) {
    if (p.test(lower)) narrativeScore++;
  }
  for (const p of INFORMATIONAL_PATTERNS) {
    if (p.test(lower)) informationalScore++;
  }

  // If both match, pick the stronger signal
  if (narrativeScore > informationalScore) return 'narrative';
  if (informationalScore > narrativeScore) return 'informational';

  // Fact topics default to informational
  if (isFactTopic(topic)) return 'informational';

  // Default: informational (safer — no forced drama)
  return 'informational';
}

// ─── Classifier ──────────────────────────────────────────────

function scoreSignals(topic: string, signals: Signal[]): number {
  let score = 0;
  for (const signal of signals) {
    if (signal.pattern.test(topic)) {
      score += signal.weight;
    }
  }
  return score;
}

/**
 * Classify a topic into a grounding mode.
 *
 * Returns the mode plus a human-readable reason for logging/debugging.
 */
export function classifyTopic(topic: string): ClassificationResult {
  const newsScore = scoreSignals(topic, NEWS_SIGNALS);
  const knowledgeScore = scoreSignals(topic, KNOWLEDGE_SIGNALS);
  const mixedScore = scoreSignals(topic, MIXED_SIGNALS);
  const contentMode: TopicContentMode = isFactTopic(topic) ? 'fact' : 'general';

  // If mixed signals are strong, route to mixed regardless of individual scores
  if (mixedScore >= 2) {
    return {
      mode: 'mixed',
      contentMode,
      reason: `mixed_signal_strong (mixed=${mixedScore}, news=${newsScore}, knowledge=${knowledgeScore})`,
      newsScore: newsScore + mixedScore,
      knowledgeScore: knowledgeScore + mixedScore,
    };
  }

  // Both have meaningful signals → mixed
  if (newsScore >= 2 && knowledgeScore >= 2) {
    return {
      mode: 'mixed',
      contentMode,
      reason: `dual_signal (news=${newsScore}, knowledge=${knowledgeScore})`,
      newsScore,
      knowledgeScore,
    };
  }

  // Clear news signal — but if it's a fact topic, force knowledge mode
  if (newsScore >= 2 && knowledgeScore < 2) {
    if (contentMode === 'fact') {
      return {
        mode: 'knowledge',
        contentMode,
        reason: `fact_topic_override (news=${newsScore} suppressed, knowledge forced)`,
        newsScore,
        knowledgeScore,
      };
    }
    return {
      mode: 'news',
      contentMode,
      reason: `news_dominant (news=${newsScore}, knowledge=${knowledgeScore})`,
      newsScore,
      knowledgeScore,
    };
  }

  // Clear knowledge signal
  if (knowledgeScore >= 2 && newsScore < 2) {
    return {
      mode: 'knowledge',
      contentMode,
      reason: `knowledge_dominant (news=${newsScore}, knowledge=${knowledgeScore})`,
      newsScore,
      knowledgeScore,
    };
  }

  // Weak signals on one side only
  if (newsScore > 0 && knowledgeScore === 0) {
    if (contentMode === 'fact') {
      return {
        mode: 'knowledge',
        contentMode,
        reason: `fact_topic_override (weak news=${newsScore} suppressed)`,
        newsScore,
        knowledgeScore,
      };
    }
    return {
      mode: 'news',
      contentMode,
      reason: `weak_news_only (news=${newsScore})`,
      newsScore,
      knowledgeScore,
    };
  }

  if (knowledgeScore > 0 && newsScore === 0) {
    return {
      mode: 'knowledge',
      contentMode,
      reason: `weak_knowledge_only (knowledge=${knowledgeScore})`,
      newsScore,
      knowledgeScore,
    };
  }

  // No signals at all → default to knowledge (Wikipedia is free, always available)
  return {
    mode: 'knowledge',
    contentMode,
    reason: `default_no_signals (news=${newsScore}, knowledge=${knowledgeScore})`,
    newsScore,
    knowledgeScore,
  };
}
