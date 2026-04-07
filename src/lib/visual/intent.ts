/**
 * Visual Intent Engine
 *
 * Adds narrative, tension, and visual hook to image prompts.
 * Moves beyond "what does this look like" to "what is happening and why
 * should someone stop scrolling."
 *
 * Intent depends on:
 *   1. Slide role (HOOK, FACT, IMPLICATION, CTA)
 *   2. Topic domain (tech, psychology, business, etc.)
 *   3. Headline meaning (extracted tension/contrast)
 */

// ─── Types ───────────────────────────────────────────────────────

export interface VisualIntent {
  /** What is physically happening in the scene — the action verb */
  scene: string;
  /** The emotional or conceptual tension that makes the image interesting */
  tension: string;
  /** A specific visual hook — the detail that catches the eye */
  visualHook: string;
  /** What to avoid — passive/generic traps for this role */
  avoid: string[];
}

export interface IntentInput {
  slideRole: string;
  topic?: string;
  headline?: string;
  subject?: string;
}

// ─── Topic Detection ─────────────────────────────────────────────

type TopicDomain =
  | 'tech' | 'psychology' | 'business' | 'health'
  | 'science' | 'animals' | 'education' | 'finance'
  | 'mythology' | 'history' | 'celebrity'
  | 'general';

const TOPIC_KEYWORDS: Record<TopicDomain, string[]> = {
  tech: ['ai', 'code', 'software', 'data', 'algorithm', 'machine', 'computer', 'digital', 'automation', 'robot', 'gpu', 'api', 'cloud', 'developer', 'engineer', 'programming', 'neural', 'model', 'deploy', 'startup'],
  psychology: ['mind', 'brain', 'behavior', 'cognitive', 'bias', 'habit', 'emotion', 'mental', 'anxiety', 'focus', 'dopamine', 'perception', 'decision', 'motivation', 'procrastination', 'memory'],
  business: ['company', 'ceo', 'revenue', 'profit', 'market', 'strategy', 'leadership', 'management', 'growth', 'scale', 'enterprise', 'corporate', 'brand', 'customer', 'sales'],
  health: ['health', 'body', 'sleep', 'exercise', 'diet', 'nutrition', 'medical', 'doctor', 'disease', 'fitness', 'longevity', 'stress', 'immune', 'recovery'],
  science: ['research', 'study', 'experiment', 'physics', 'chemistry', 'biology', 'nasa', 'space', 'quantum', 'discovery', 'evolution', 'atom', 'genome'],
  animals: ['animal', 'dog', 'cat', 'wildlife', 'species', 'predator', 'prey', 'ocean', 'bird', 'insect', 'nature', 'ecosystem', 'marine', 'extinct', 'shark', 'whale', 'dolphin', 'octopus', 'jellyfish', 'fish', 'reef', 'deep sea', 'reptile', 'mammal', 'primate', 'snake', 'cobra', 'viper', 'python', 'lizard', 'crocodile', 'alligator', 'turtle', 'tortoise', 'frog', 'toad', 'bear', 'wolf', 'lion', 'tiger', 'elephant', 'eagle', 'hawk', 'owl', 'horse', 'monkey', 'ape', 'gorilla', 'bat', 'spider', 'scorpion', 'ant', 'bee', 'butterfly', 'crab', 'lobster', 'squid', 'coral', 'penguin', 'seal', 'otter', 'deer', 'fox', 'rabbit', 'rat', 'mouse', 'parrot', 'crow', 'raven', 'venom', 'fang', 'claw', 'tail', 'fin', 'wing', 'herd', 'pack', 'flock', 'swarm', 'hippo', 'rhino', 'giraffe', 'zebra', 'cheetah', 'leopard', 'panther', 'jaguar', 'hyena', 'buffalo', 'moose', 'camel', 'donkey', 'pig', 'cow', 'sheep', 'goat', 'chicken', 'duck', 'goose', 'swan', 'flamingo', 'pelican', 'heron', 'stork', 'vulture', 'condor', 'falcon', 'pigeon', 'dove', 'woodpecker', 'toucan', 'panda', 'koala', 'kangaroo', 'platypus', 'wombat', 'sloth', 'armadillo', 'hedgehog', 'porcupine', 'raccoon', 'skunk', 'badger', 'wolverine', 'mink', 'weasel', 'ferret', 'chinchilla', 'hamster', 'guinea pig', 'iguana', 'chameleon', 'gecko', 'salamander', 'newt', 'axolotl', 'stingray', 'barracuda', 'swordfish', 'tuna', 'salmon', 'trout', 'eel', 'seahorse', 'starfish', 'urchin', 'clam', 'oyster', 'snail', 'slug', 'centipede', 'millipede', 'mantis', 'dragonfly', 'moth', 'beetle', 'wasp', 'hornet', 'cricket', 'grasshopper', 'cicada', 'firefly', 'ladybug', 'caterpillar', 'maggot', 'larva', 'pupa'],
  education: ['learn', 'school', 'teach', 'student', 'university', 'course', 'knowledge', 'skill', 'training', 'curriculum'],
  finance: ['money', 'invest', 'stock', 'crypto', 'wealth', 'debt', 'bank', 'trading', 'portfolio', 'inflation', 'interest', 'compound'],
  mythology: ['myth', 'mythology', 'mythological', 'god', 'goddess', 'zeus', 'odin', 'thor', 'athena', 'apollo', 'hades', 'poseidon', 'hermes', 'ares', 'aphrodite', 'olympus', 'titan', 'demigod', 'cerberus', 'hydra', 'minotaur', 'medusa', 'phoenix', 'dragon', 'norse', 'greek', 'roman', 'egyptian', 'hindu', 'celtic', 'aztec', 'temple', 'oracle', 'prophecy', 'underworld', 'pantheon', 'deity', 'sacred', 'ancient'],
  history: ['history', 'historical', 'ancient', 'medieval', 'empire', 'dynasty', 'civilization', 'pharaoh', 'emperor', 'king', 'queen', 'war', 'battle', 'revolution', 'colonial', 'renaissance', 'century', 'era', 'period', 'artifact', 'archaeological', 'roman', 'greek', 'egyptian', 'ottoman', 'viking', 'samurai', 'gladiator', 'pyramid', 'colosseum'],
  celebrity: ['singer', 'musician', 'rapper', 'artist', 'actor', 'actress', 'celebrity', 'performer', 'band', 'athlete', 'footballer', 'player', 'director', 'filmmaker', 'composer', 'songwriter', 'producer', 'comedian', 'entertainer', 'influencer', 'youtuber', 'streamer', 'pop star', 'rock star', 'music artist', 'music facts'],
  general: [],
};

/** Informational domains get literal imagery and priority in tie-breaking */
const INFORMATIONAL_DOMAINS = new Set<TopicDomain>(['animals', 'science', 'health', 'education', 'history', 'mythology']);

/**
 * Match a keyword against text using whole-word boundaries for single-word
 * keywords, and substring matching for multi-word keywords.
 *
 * This prevents false positives like "ant" matching "anti-gravity",
 * "interest" matching "interesting", or "ram" matching "program".
 */
function matchesKeyword(text: string, kw: string): boolean {
  if (kw.includes(' ')) return text.includes(kw);
  return new RegExp(`\\b${kw}\\b`).test(text);
}

function detectTopic(input: IntentInput): TopicDomain {
  if (input.topic) {
    const normalized = input.topic.toLowerCase() as TopicDomain;
    if (normalized in TOPIC_KEYWORDS) return normalized;
  }

  // Auto-detect from headline + subject + topic
  // Weight the topic field 3× so the core topic always dominates over
  // incidental keyword matches in headlines (e.g., "habit" matching psychology
  // when the topic is "lions").
  const topicText = input.topic?.toLowerCase() || '';
  const otherText = [input.headline, input.subject].filter(Boolean).join(' ').toLowerCase();
  const text = otherText + ' ' + topicText;

  let bestMatch: TopicDomain = 'general';
  let bestScore = 0;

  for (const [domain, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (domain === 'general') continue;
    let score = 0;
    for (const kw of keywords) {
      // Count matches in topic field with 3× weight
      if (matchesKeyword(topicText, kw)) score += 3;
      // Count matches in headline/subject with 1× weight
      else if (matchesKeyword(otherText, kw)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = domain as TopicDomain;
    } else if (score === bestScore && score > 0) {
      // Tie-break: prefer informational domains (animals, science, etc.)
      // so they always take the informational rendering path
      const currentIsInfo = INFORMATIONAL_DOMAINS.has(bestMatch);
      const candidateIsInfo = INFORMATIONAL_DOMAINS.has(domain as TopicDomain);
      if (candidateIsInfo && !currentIsInfo) {
        bestMatch = domain as TopicDomain;
      }
    }
  }

  return bestMatch;
}

// ─── Headline Tension Extraction ─────────────────────────────────

interface HeadlineTension {
  type: 'contrast' | 'threat' | 'revelation' | 'challenge' | 'transformation' | 'neutral';
  keywords: string[];
}

const TENSION_PATTERNS: Array<{ pattern: RegExp; type: HeadlineTension['type']; }> = [
  // Contrast: X vs Y, but, however, instead
  { pattern: /\bvs\.?\b|\bbut\b|\bhowever\b|\binstead\b|\bnot\b.*\b(it'?s|is)\b/i, type: 'contrast' },
  // Threat: never, kill, destroy, replace, end, die, fail
  { pattern: /\b(never|kill|destroy|replace|end|die|fail|collapse|crash|broke|dead|disappear|obsolete)\b/i, type: 'threat' },
  // Revelation: secret, hidden, truth, real, actually, nobody
  { pattern: /\b(secret|hidden|truth|real|actually|nobody|no\s*one|didn'?t\s*know|don'?t\s*know|reveal)\b/i, type: 'revelation' },
  // Challenge: wrong, mistake, stop, you'?re, myth, lie
  { pattern: /\b(wrong|mistake|stop|myth|lie|fake|fraud|scam|trap|dangerous)\b/i, type: 'challenge' },
  // Transformation: become, change, transform, build, create, start, unlock
  { pattern: /\b(become|change|transform|build|create|start|unlock|master|level\s*up|upgrade)\b/i, type: 'transformation' },
];

function extractHeadlineTension(headline?: string): HeadlineTension {
  if (!headline) return { type: 'neutral', keywords: [] };

  const words = headline.toLowerCase().split(/\s+/);
  for (const { pattern, type } of TENSION_PATTERNS) {
    const match = headline.match(pattern);
    if (match) {
      return { type, keywords: [match[0].toLowerCase()] };
    }
  }

  return { type: 'neutral', keywords: [] };
}

// ─── Role-Based Intent Strategies ────────────────────────────────

/**
 * HOOK intent strategy.
 * Must create immediate visual tension. Never passive.
 * The image should make someone stop scrolling.
 */
function buildHookIntent(topic: TopicDomain, tension: HeadlineTension, input: IntentInput): VisualIntent {
  // Celebrity: cinematic portrait of the real person
  if (topic === 'celebrity') {
    return buildCelebrityHookIntent(input);
  }

  // Informational domains: the OPENER must depict the actual subject, not abstract drama
  const isInformational = INFORMATIONAL_DOMAINS.has(topic);

  if (isInformational) {
    return buildInformationalHookIntent(topic, input);
  }

  const base: VisualIntent = {
    scene: '',
    tension: '',
    visualHook: '',
    avoid: [
      'person sitting calmly at a desk',
      'person typing on a laptop',
      'generic office scene with no action',
      'stock photo poses (crossed arms, pointing)',
      'smiling or relaxed expressions',
      'person looking at camera neutrally',
    ],
  };

  // Scene strategy based on headline tension type
  switch (tension.type) {
    case 'contrast':
      base.scene = 'two opposing forces visible in a single frame — one side warm/organic, one side cold/digital, a clear visual divide down the center';
      base.tension = 'the viewer should feel pulled between two worlds that cannot coexist';
      base.visualHook = 'a sharp boundary line between the two sides — like light meeting shadow, or skin meeting circuit';
      break;

    case 'threat':
      base.scene = 'a moment of impact frozen in time — something is about to break, fall, or vanish. The subject is caught in the last second before change';
      base.tension = 'imminent loss — the viewer sees something about to disappear and feels urgency';
      base.visualHook = 'motion blur on one element while everything else is frozen, or cracks spreading through a solid surface';
      break;

    case 'revelation':
      base.scene = 'a hidden thing becoming visible — a curtain being pulled back, a mask half-removed, a door opening onto blinding light in a dark room';
      base.tension = 'the viewer suspects they have been looking at the wrong thing this entire time';
      base.visualHook = 'a second layer visible underneath the surface — like peeling paint revealing wiring, or a reflection showing a different reality';
      break;

    case 'challenge':
      base.scene = 'a subject confronting the viewer directly — leaning forward, finger pointing at camera, or standing at the edge of a precipice looking back';
      base.tension = 'accusation or uncomfortable truth — the viewer feels personally addressed';
      base.visualHook = 'direct eye contact with the camera, or a hand reaching toward the lens';
      break;

    case 'transformation':
      base.scene = 'a figure mid-transformation — half in shadow, half in light, stepping through a threshold, or shedding an old form';
      base.tension = 'the viewer sees what they could become if they act now';
      base.visualHook = 'a stark before/after split visible on the same subject — one side aged/worn, the other side sharp/new';
      break;

    default:
      base.scene = 'a single figure in a vast dark space, dwarfed by something enormous — a wall of screens, a collapsing structure, or an approaching storm';
      base.tension = 'the weight of something massive about to happen — anticipation, not action';
      base.visualHook = 'extreme scale contrast — tiny human figure against something impossibly large';
      break;
  }

  // Topic-specific refinements for HOOK (non-informational only)
  switch (topic) {
    case 'tech':
      base.scene += '. The environment is tech — screens, server lights, holographic glows, but the human element is raw and physical';
      base.visualHook += '. Glowing data or code fragments reflected on skin or floating in the air around the subject';
      break;
    case 'psychology':
      base.scene += '. The scene is internal made external — abstract brain patterns, fractured mirrors, or a labyrinth visible through the subject';
      base.visualHook += '. Fracture lines or x-ray-like transparency showing something hidden inside';
      break;
    case 'business':
      base.scene += '. Corporate power symbols — empty boardroom, towering glass building, lone figure on a trading floor after hours';
      base.visualHook += '. A single human dwarfed by institutional architecture, shot from below';
      break;
    case 'finance':
      base.scene += '. Money or charts as physical objects — crumbling, burning, or cascading like water';
      base.visualHook += '. Physical destruction or transformation of something that represents wealth';
      break;
    default:
      break;
  }

  return base;
}

/**
 * CELEBRITY HOOK intent — cinematic portrait of the real person.
 * The opener must look like the actual person, not a generic model.
 */
function buildCelebrityHookIntent(input: IntentInput): VisualIntent {
  const subject = input.subject || 'the person';
  return {
    scene: `${subject} — cinematic close-up portrait. Dramatic editorial lighting. The subject fills the frame. The image should look like a high-end magazine cover or documentary still`,
    tension: 'the viewer recognises this specific person and is drawn in by their presence and charisma',
    visualHook: `the face and expression of ${subject} — sharp focus, photorealistic skin detail, compelling gaze`,
    avoid: [
      'generic model or placeholder person',
      'abstract or symbolic imagery',
      'multiple people or crowd',
      'blurred or obscured face',
      'text, logos, or watermarks',
      'cartoon or illustrated style',
    ],
  };
}

/**
 * INFORMATIONAL HOOK intent — dramatic but LITERAL.
 *
 * The opener must feature the actual topic subject (the animal, organism, phenomenon)
 * in a visually striking but realistic way. No abstract drama, no unrelated creatures.
 */
function buildInformationalHookIntent(topic: TopicDomain, input: IntentInput): VisualIntent {
  const subject = input.subject || 'the subject';

  const base: VisualIntent = {
    scene: `${subject} in its natural environment, captured in a dramatic but realistic moment. The image must depict this exact subject — not a different animal or unrelated scene`,
    tension: 'the raw power, beauty, or strangeness of the real subject — the viewer is drawn in by seeing the actual creature or phenomenon up close',
    visualHook: `a striking, intimate view of ${subject} — dramatic natural lighting, sharp detail on the subject, the kind of shot that makes someone stop scrolling`,
    avoid: [
      'animals or creatures other than the stated subject',
      'abstract or symbolic imagery',
      'human figures unless the topic is about humans',
      'sci-fi or fantasy elements',
      'generic dramatic portraiture',
      'doorways, thresholds, or metaphorical scenes',
      'wolves, eagles, hawks, or other placeholder animals',
    ],
  };

  switch (topic) {
    case 'animals':
      base.scene = `${subject} in its natural habitat — underwater, terrestrial, or aerial as appropriate. Dramatic wildlife photography, the animal is the entire focus. No other animal species in the frame`;
      base.tension = 'the viewer is face-to-face with a powerful, real creature — awe, not abstraction';
      base.visualHook = `close-up or dramatic angle of ${subject}, showing its most visually striking feature — teeth, eyes, skin texture, movement — with cinematic natural lighting`;
      break;
    case 'science':
      base.scene = `the scientific subject described — the phenomenon, organism, or process in its real context. Documentary or nature photography style`;
      base.tension = 'the viewer sees something extraordinary that actually exists in nature or the lab';
      base.visualHook = 'the most visually striking aspect of the scientific subject — scale, color, structure, or process — in sharp realistic detail';
      break;
    case 'health':
      base.scene = 'the biological or physical subject in realistic medical or sports photography style';
      base.tension = 'the viewer sees the real human body or biological process in stunning detail';
      base.visualHook = 'the physical reality of the subject — anatomical detail, athletic movement, or medical imagery';
      break;
    case 'history':
      base.scene = `${subject} — the historical figure, artifact, or location depicted in period-accurate style. Show the actual person or object, not a metaphor. Historical painting or documentary photography style`;
      base.tension = 'the viewer comes face-to-face with history — the real person, the real artifact, the real place';
      base.visualHook = `a striking, detailed depiction of ${subject} — period-accurate clothing, architecture, or artifacts. The kind of image that makes history feel tangible and real`;
      break;
    case 'mythology':
      base.scene = `${subject} — the mythological figure, creature, or location depicted in ancient-world realism. Show the named character or creature, not generic fantasy`;
      base.tension = 'the viewer encounters the mythological being as if it were real — awe and reverence, not cartoon or abstraction';
      base.visualHook = `a dramatic, detailed depiction of ${subject} — ancient world setting, dramatic lighting, the specific mythological figure rendered with cinematic realism`;
      break;
    default:
      break;
  }

  return base;
}

/**
 * FACT intent strategy.
 * Must directly illustrate the factual claim — show the event, characters,
 * and consequence described in the headline/body. NO abstraction.
 *
 * The image must be VISUAL PROOF of the claim: a viewer should understand
 * the story from the image alone.
 */
function buildFactIntent(topic: TopicDomain, tension: HeadlineTension, input: IntentInput): VisualIntent {
  // Celebrity: show the real person in context of the specific fact
  if (topic === 'celebrity') {
    return buildCelebrityFactIntent(input);
  }

  // Informational domains (animals, science, health) get LITERAL imagery
  const isInformational = INFORMATIONAL_DOMAINS.has(topic);

  if (isInformational) {
    return buildInformationalFactIntent(topic, input);
  }

  // Narrative domains (mythology, history) keep dramatic imagery
  const base: VisualIntent = {
    scene: 'a specific moment from the factual claim — showing the characters, action, and setting described in the headline. The image depicts the EVENT itself, not an abstract representation',
    tension: 'the viewer sees what actually happened — the transformation, consequence, or confrontation that makes this fact memorable',
    visualHook: 'the key narrative element from the claim made visually undeniable — the specific character, creature, object, or transformation that IS the fact',
    avoid: [
      'abstract human forms or silhouettes',
      'glowing energy cores or sci-fi anatomy',
      'floating data points or holographic numbers',
      'generic moody atmosphere with no subject',
      'symbolic or metaphorical imagery',
      'futuristic or modern elements',
      'static portraits without action or context',
      'decorative images unrelated to the claim',
    ],
  };

  switch (topic) {
    case 'mythology':
      base.scene = 'a specific mythological event — show the named characters, their action, and the setting from the story. Ancient world, dramatic but realistic';
      base.tension = 'the mythological consequence made visible — transformation, punishment, or divine intervention as it happens';
      base.visualHook = 'the specific mythological element that defines the fact — the creature, the transformation, the divine act — rendered in ancient-world realism';
      break;
    case 'history':
      base.scene = 'a specific historical event — show the people, place, and action from the claim. Period-accurate setting and materials';
      base.tension = 'the historical moment frozen at its most dramatic point — the battle, discovery, or turning point';
      base.visualHook = 'the physical evidence of the historical claim — the artifact, the battlefield, the architectural feat';
      break;
    default:
      break;
  }

  return base;
}

/**
 * CELEBRITY FACT intent — show the real person in the context of the specific fact.
 * Photojournalism / editorial style — the person doing or being associated with the claim.
 */
function buildCelebrityFactIntent(input: IntentInput): VisualIntent {
  const subject = input.subject || 'the person';
  const headline = input.headline || '';
  return {
    scene: `${subject} — ${headline ? `in a scene related to: ${headline}` : 'captured in a candid editorial moment'}. Photojournalism or editorial photography style. The subject is recognisably themselves`,
    tension: 'the viewer sees the real person connected to the specific fact — a candid or iconic moment that makes the claim believable',
    visualHook: `${subject} in a recognisable pose or context — sharp, photorealistic, editorial quality`,
    avoid: [
      'generic placeholder person',
      'abstract or symbolic imagery',
      'text, logos, or watermarks',
      'cartoon or illustrated style',
      'blurred or obscured face',
    ],
  };
}

/**
 * INFORMATIONAL FACT intent — LITERAL imagery only.
 *
 * The image must depict exactly what the fact describes:
 * - The exact animal/subject
 * - The exact behavior/trait/mechanism
 * - A real, grounded environment
 *
 * No symbolism. No metaphors. No sci-fi. No abstraction.
 */
function buildInformationalFactIntent(topic: TopicDomain, input: IntentInput): VisualIntent {
  const subject = input.subject || input.headline || 'the subject';
  const headline = input.headline || '';
  const headlineLower = headline.toLowerCase();

  // Build a concrete scene description from the headline text.
  // Instead of "the behavior from the claim" (which Gemini can't resolve),
  // embed the actual headline so the prompt is self-contained.
  const concreteAction = headline
    ? `${subject} — specifically: ${headline}`
    : subject;

  const base: VisualIntent = {
    scene: `${concreteAction}. Show this exact scene literally: the subject performing the exact action described. Literal depiction in a real, natural environment. The image answers: "What is physically happening in this fact?"`,
    tension: 'the biological or physical reality that makes this fact extraordinary — the viewer sees the actual mechanism, behavior, or scale',
    visualHook: `the specific physical detail described in "${headline}" — the body part, the movement, the size comparison, the environment — depicted with photographic realism`,
    avoid: [
      'futuristic UI or HUD overlays',
      'robotic or mechanical hands',
      'holograms or glowing spheres',
      'energy cores or glowing elements',
      'abstract data visualization',
      'symbolic or metaphorical imagery',
      'generic dramatic portraiture',
      'sci-fi environments or technology',
      'human figures unless the fact is about humans',
      'decorative images unrelated to the specific claim',
      'stylized or artistic interpretations',
      'dark moody atmosphere without a clear subject',
      'generic depiction of the subject without the specific action from the headline',
    ],
  };

  switch (topic) {
    case 'animals':
      base.scene = `${concreteAction}. Show this exact behavior literally — the animal doing exactly what the headline describes. Realistic wildlife photography in the correct environment for this action (underwater, on land, in air — whichever matches the fact). Wildlife photography style`;
      base.tension = 'the biological reality of the animal — the viewer sees the actual physical feature, hunting behavior, or defense mechanism described';
      base.visualHook = `the specific visual proof of "${headline}" — show the exact body part, movement, or behavior that makes this fact true, in sharp realistic detail`;
      break;
    case 'science':
      base.scene = `${concreteAction}. Show this exact phenomenon literally — the physical process, the natural occurrence, or the laboratory observation as described. Real environment, real materials`;
      base.tension = 'the physical reality of the phenomenon made visible at the right scale — microscopic, human-scale, or cosmic as the fact requires';
      base.visualHook = `the specific physical evidence of "${headline}" — the reaction, formation, or object — photographed or rendered with documentary realism`;
      break;
    case 'health':
      base.scene = `${concreteAction}. Show this exact biological or medical phenomenon literally — real tissue, real movement, real environment. Medical documentary or sports photography style`;
      base.tension = 'the physical reality of the body — the viewer sees the actual mechanism or process described in the fact';
      base.visualHook = `the specific anatomical or physiological detail from "${headline}" — muscle, bone, cellular structure, or physical performance`;
      break;
    case 'history':
      base.scene = `${concreteAction}. Show this exact historical fact literally — the person, artifact, document, invention, or event described. Period-accurate depiction with correct clothing, architecture, and materials. Historical painting or documentary photography style`;
      base.tension = 'the viewer sees the actual historical artifact, invention, or moment — tangible and real, not metaphorical';
      base.visualHook = `the specific historical evidence from "${headline}" — the artifact, document, invention, or person — depicted with period accuracy and dramatic lighting`;
      base.avoid.push(
        'modern or contemporary settings',
        'generic placeholder animals (falcons, eagles, wolves)',
        'stock photo businesspeople or modern offices',
        'abstract or symbolic representations of history',
      );
      break;
    case 'mythology':
      base.scene = `${concreteAction}. Show this exact mythological scene literally — the named god, creature, or event described. Ancient world realism with period-accurate architecture and materials`;
      base.tension = 'the viewer witnesses the mythological event as if it actually happened — cinematic realism, not cartoon';
      base.visualHook = `the specific mythological element from "${headline}" — the god, creature, transformation, or divine act — rendered in ancient-world cinematic realism`;
      base.avoid.push(
        'modern or contemporary settings',
        'generic placeholder animals',
        'abstract or symbolic imagery',
        'cartoon or anime style',
      );
      break;
    default:
      break;
  }

  return base;
}

/**
 * IMPLICATION intent strategy.
 * Must show weight, consequence, aftermath. The "so what" made visual.
 */
function buildImplicationIntent(topic: TopicDomain, tension: HeadlineTension, input: IntentInput): VisualIntent {
  return {
    scene: 'the aftermath or consequence of a force — a landscape changed, a structure bearing weight, or a person absorbing an impact. Not the event itself but what it left behind',
    tension: 'irreversibility — the viewer sees that something has already changed and cannot go back',
    visualHook: 'visible damage, deformation, or transformation on an otherwise familiar object — cracks in glass, a bent steel beam, erosion marks, or a shadow that is shaped differently from the object casting it',
    avoid: [
      'abstract concept art with no anchor',
      'calm landscape with no tension',
      'person thinking or contemplating passively',
      'generic dark moody atmosphere with nothing happening',
      'symmetric balanced composition (implication should feel off-balance)',
    ],
  };
}

/**
 * CTA intent strategy.
 *
 * The CTA slide must ALWAYS be visually relevant to the carousel's topic.
 * Show the actual subject in a wide, beautiful, concluding composition —
 * optionally combined with a knowledge/discovery/learning motif
 * (e.g. an open book, a magnifying glass, a path leading deeper into the subject's world).
 *
 * NEVER use generic imagery (finance charts, businesspeople, doorways, abstract light).
 */
function buildCtaIntent(topic: TopicDomain, _tension: HeadlineTension, input: IntentInput): VisualIntent {
  const subject = input.subject || 'the subject';

  return {
    scene: `${subject} — a wide, beautiful establishing shot that visually connects to the carousel's topic. The subject of the carousel is clearly present in the image. Optionally include a subtle knowledge or discovery motif (an open book, a magnifying glass, a trail leading deeper, light illuminating a detail) to suggest "there is more to learn." The image wraps up the visual story while inviting the viewer to keep exploring`,
    tension: 'a sense of wonder and invitation — the viewer has learned about this subject and now feels there is even more to discover',
    visualHook: `a wide or medium shot of ${subject} in its real environment or context — dramatic lighting suggesting a grand conclusion. The composition should feel like a closing shot in a documentary: beautiful, resolved, but hinting at depth beyond the frame`,
    avoid: [
      'doorways, thresholds, or metaphorical scenes',
      'human figures stepping through light',
      'abstract or symbolic imagery unrelated to the topic',
      'stock photo businesspeople, offices, or finance imagery',
      'coins, stock charts, globes, or trading floors',
      'wolves, eagles, hawks, or other placeholder animals',
      'sci-fi or fantasy elements',
      'generic motivational sunrise/sunset with no subject',
      'anything that could apply to ANY topic — the image must be specific to THIS subject',
    ],
  };
}

// ─── Fallback for other roles ────────────────────────────────────

function buildGenericIntent(role: string, topic: TopicDomain, tension: HeadlineTension, input: IntentInput): VisualIntent {
  return {
    scene: 'a focused moment with clear subject-environment interaction — the subject is doing something specific, not just existing in a space',
    tension: 'information or emotion is being transferred — something is being revealed, built, or broken',
    visualHook: 'strong light/shadow contrast on the primary subject, with one unexpected element that does not belong in the scene',
    avoid: [
      'static portrait with no action',
      'generic dark background with floating subject',
      'stock photo composition',
    ],
  };
}

// ─── Main Intent Builder ─────────────────────────────────────────

/**
 * Build visual intent for a slide based on role, topic, and headline.
 */
export function buildVisualIntent(input: IntentInput): VisualIntent {
  const topic = detectTopic(input);
  const tension = extractHeadlineTension(input.headline);
  const role = (input.slideRole ?? '').toUpperCase();

  switch (role) {
    case 'HOOK':
    case 'OPENER':
      return buildHookIntent(topic, tension, input);
    case 'FACT':
    case 'BUILD':
      return buildFactIntent(topic, tension, input);
    case 'IMPLICATION':
    case 'TWIST':
    case 'INSIGHT':
      return buildImplicationIntent(topic, tension, input);
    case 'CTA':
      return buildCtaIntent(topic, tension, input);
    default:
      return buildGenericIntent(role, topic, tension, input);
  }
}

/**
 * Detect the topic domain from input signals.
 * Exported for testing/debugging.
 */
export { detectTopic, extractHeadlineTension };
export type { TopicDomain, HeadlineTension };
