/**
 * Style Lock — Visual Discipline System
 *
 * Intercepts after intent generation and enforces strict style rules
 * to eliminate generic AI aesthetics and push toward grounded, physical,
 * photographic reality.
 *
 * For each topic:
 *   - rules:      what IS the visual language (positive directives)
 *   - constraints: what is LIMITED (allowed sparingly, with conditions)
 *   - exclusions:  what is FORBIDDEN (stripped from prompts, added to negative)
 *
 * The style lock rewrites intent phrases that violate exclusions and
 * injects grounding directives into the final prompt.
 */

import type { VisualIntent } from './intent';
import type { TopicDomain } from './intent';

// ─── Types ───────────────────────────────────────────────────────

export interface StyleLockProfile {
  topic: TopicDomain;

  /** Positive directives — what the image MUST feel like */
  rules: {
    /** One-line philosophy for this topic's visual identity */
    principle: string;
    /** Specific visual elements that ARE allowed and encouraged */
    allowed: string[];
    /** Photography/rendering style directive */
    photographyStyle: string;
    /** Material and texture directive — what surfaces look like */
    materiality: string;
  };

  /** Limited elements — allowed only under these conditions */
  constraints: Array<{
    element: string;
    condition: string;
  }>;

  /** Forbidden elements — stripped from prompts, added to negative */
  exclusions: {
    /** Exact phrases to search for and remove/replace in intent text */
    bannedPhrases: Array<{
      pattern: RegExp;
      replacement: string;
    }>;
    /** Added to negative prompt verbatim */
    negativePhrases: string[];
  };

  /** Grounding directive — injected into every prompt for this topic */
  groundingDirective: string;
}

// ─── Style Lock Profiles ─────────────────────────────────────────

const TECH: StyleLockProfile = {
  topic: 'tech',

  rules: {
    principle: 'Technology is physical infrastructure, not magic. Show the weight, heat, and mess of real machines.',
    allowed: [
      'real server racks with visible cables and dust',
      'monitor screens showing actual code or terminal text (not glowing symbols)',
      'physical keyboards, worn desk surfaces, coffee stains',
      'data center corridors with fluorescent overhead lighting',
      'printed circuit boards, actual chip photography',
      'whiteboard diagrams, sticky notes, physical documentation',
      'the warm amber of indicator LEDs on hardware',
    ],
    photographyStyle: 'editorial documentary photography, shot on 35mm film, available light only, no post-production color grading, slight grain',
    materiality: 'brushed aluminum, matte black plastic, dusty glass, cable rubber, industrial concrete floors',
  },

  constraints: [
    { element: 'screen glow', condition: 'only as ambient light source illuminating a face or surface — never as floating content' },
    { element: 'blue color temperature', condition: 'only from actual monitors or LEDs — never as a mood wash over the whole scene' },
    { element: 'reflections on skin', condition: 'only natural light reflections — never data, code, or UI projected onto a face' },
  ],

  exclusions: {
    bannedPhrases: [
      { pattern: /holographic?\s*(display|glow|interface|element|data|overlay)/gi, replacement: 'a wall of stacked monitors showing dense terminal output' },
      { pattern: /floating\s*(code|data|text|element|fragment|number|symbol)/gi, replacement: 'printed paper scattered on a desk' },
      { pattern: /glowing\s*(data|code|blue|circuit|neural|line|symbol|fragment)/gi, replacement: 'the amber light of server rack LEDs in a dark room' },
      { pattern: /code\s*fragments?\s*(reflected|floating|projected|shattering|shatter)/gi, replacement: 'a printed stack of code pages with red pen annotations' },
      { pattern: /neural\s*(network|pathway|connection|circuit)/gi, replacement: 'tangled ethernet cables' },
      { pattern: /futuristic\s*(dark\s*)?HUD\s*interface/gi, replacement: 'a crowded multi-monitor workstation in a dim room' },
      { pattern: /tron|cyberpunk|neon\s*grid|digital\s*rain|matrix/gi, replacement: 'industrial tech environment' },
      { pattern: /circuit\s*board\s*(overlay|pattern|on\s*skin|visible\s*through)/gi, replacement: 'visible wear marks and scratches on equipment' },
    ],
    negativePhrases: [
      'holographic display', 'floating code', 'floating data', 'glowing blue data',
      'tron aesthetic', 'cyberpunk neon', 'digital rain', 'matrix effect',
      'neural network visualization', 'circuit overlay on skin',
      'futuristic HUD', 'sci-fi interface', 'hologram',
      'glowing wireframe', 'data particles', 'light trails',
      'transparent screen', 'augmented reality overlay',
    ],
  },

  groundingDirective: 'Shot like a documentary photograph of a real workplace. Physical objects have weight, dust, and wear. Technology is infrastructure — racks, cables, screens — not magic. Available light only. No visual effects that could not exist in a real photograph.',
};

const PSYCHOLOGY: StyleLockProfile = {
  topic: 'psychology',

  rules: {
    principle: 'The mind is invisible. Show it through body language, architecture, and physical metaphor — never through literal brain imagery.',
    allowed: [
      'real human facial expressions — micro-expressions, tension in jaw, unfocused eyes',
      'physical mirrors, glass reflections, window panes as metaphor for self-perception',
      'architectural spaces as metaphor — narrow corridors, vast empty rooms, doors',
      'hands as expression — gripping, releasing, covering face, reaching',
      'physical objects as anchors — a clock, a chess piece, a cracked phone screen',
      'fog, rain, condensation on glass as emotional texture',
    ],
    photographyStyle: 'intimate portraiture, natural window light, shallow depth of field, slight underexposure, muted color palette',
    materiality: 'skin texture, fabric wrinkles, condensation on glass, worn wood, old paper, tarnished metal',
  },

  constraints: [
    { element: 'double exposure', condition: 'only with real physical elements (cityscape through a face, trees through a silhouette) — never with abstract patterns' },
    { element: 'blur', condition: 'only as shallow depth of field or motion blur from real movement — never as a glitch or digital effect' },
    { element: 'shadows', condition: 'cast by real light sources — never symbolic shadow shapes that differ from their caster' },
  ],

  exclusions: {
    bannedPhrases: [
      { pattern: /abstract\s*brain\s*pattern/gi, replacement: 'a person pressing their forehead against cold glass' },
      { pattern: /fractured\s*mirror/gi, replacement: 'a reflection in a rain-streaked window that distorts the face' },
      { pattern: /x-ray[- ]like\s*transparency/gi, replacement: 'a face half-lit, half in deep shadow' },
      { pattern: /labyrinth\s*visible\s*through/gi, replacement: 'a long narrow corridor receding into darkness behind the subject' },
      { pattern: /neural\s*(circuitry|connection|pathway|synapse)/gi, replacement: 'veins visible through thin skin on a temple or wrist' },
      { pattern: /fracture\s*lines?\s*(on|through|across|over)/gi, replacement: 'deep creases and tension lines on' },
      { pattern: /glowing\s*synapse/gi, replacement: 'a single shaft of light cutting across a dark face' },
      { pattern: /brain\s*(scan|imagery|visual|render|anatomy)/gi, replacement: 'a person gripping their own head with both hands' },
      { pattern: /internal\s*made\s*external/gi, replacement: 'inner state shown through posture and expression' },
      { pattern: /thought\s*(bubble|cloud|visual)/gi, replacement: 'an unfocused distant stare' },
    ],
    negativePhrases: [
      'visible brain', 'brain anatomy', 'neural network render', 'synapse glow',
      'x-ray view', 'transparent skull', 'glitch effect on face',
      'digital fracture', 'abstract thought visualization',
      'psychedelic pattern', 'kaleidoscope', 'mandala',
      'brain scan', 'EEG waves', 'neural pathway',
      'mind map overlay', 'consciousness visualization',
    ],
  },

  groundingDirective: 'Shot like intimate portrait photography. All emotion comes from the human body — face, hands, posture — never from visual effects. Metaphor comes from the physical environment (architecture, light, weather), not from overlays or digital manipulation. The image must look like it was taken with a real camera.',
};

const BUSINESS: StyleLockProfile = {
  topic: 'business',

  rules: {
    principle: 'Power is architectural. Show it through empty spaces, scale, and the physical weight of institutions.',
    allowed: [
      'real corporate architecture — glass lobbies, empty trading floors, long conference tables',
      'physical documents, contracts, rubber stamps, printed charts with pen marks',
      'a single figure dwarfed by institutional space',
      'overhead fluorescent lighting in empty offices after hours',
      'security cameras, badge readers, revolving doors — institutional infrastructure',
      'physical clocks, calendars, worn briefcases, stacked binders',
    ],
    photographyStyle: 'architectural photography meets street documentary, wide angle, deep focus, overhead or low angle, desaturated palette',
    materiality: 'polished marble, plate glass, brushed steel elevator doors, worn carpet, fluorescent-lit dropped ceiling tiles',
  },

  constraints: [
    { element: 'city skyline', condition: 'only as a background through a window — never as the primary subject' },
    { element: 'suits', condition: 'only from behind or in silhouette — never a stock photo face-on portrait' },
    { element: 'graphs/charts', condition: 'only as physical printouts on a desk — never as floating/digital elements' },
  ],

  exclusions: {
    bannedPhrases: [
      { pattern: /holographic\s*(chart|graph|data|display)/gi, replacement: 'printed quarterly report pages spread across a mahogany table' },
      { pattern: /towering\s*glass\s*building/gi, replacement: 'a long empty corridor of identical office doors' },
      { pattern: /floating\s*(graph|chart|metric|number)/gi, replacement: 'a whiteboard covered in handwritten numbers and crossing-out marks' },
      { pattern: /digital\s*(dashboard|display|screen\s*wall)/gi, replacement: 'a wall of framed annual reports and faded company photos' },
    ],
    negativePhrases: [
      'holographic chart', 'floating graph', 'digital dashboard',
      'people shaking hands', 'team high-five', 'stock photo business meeting',
      'generic skyscraper', 'motivational quote backdrop',
      'golden trophy', 'chess piece metaphor',
      'rocket launch metaphor', 'mountain summit metaphor',
    ],
  },

  groundingDirective: 'Shot like a Gregory Crewdson photograph of corporate America. Institutional spaces that feel empty, heavy, and slightly uncanny. Power is shown through scale and emptiness, not through symbols. Physical objects show wear — this is a place that has been used, not rendered.',
};

const HEALTH: StyleLockProfile = {
  topic: 'health',

  rules: {
    principle: 'The body is real tissue and effort. Show physicality, not clinical abstractions.',
    allowed: [
      'real skin texture — sweat, veins, goosebumps, muscle definition',
      'physical environments — gym floors, hospital corridors, kitchen counters',
      'food as physical material — raw ingredients, prep mess, actual meals',
      'movement captured mid-stride — running, lifting, stretching, breathing',
      'medical infrastructure — IV stands, waiting room chairs, prescription bottles',
    ],
    photographyStyle: 'sports photography or medical documentary, high shutter speed for motion, available light, close-up detail shots',
    materiality: 'skin, sweat, cotton, rubber mat, stainless steel, tile, gauze',
  },

  constraints: [
    { element: 'anatomical detail', condition: 'only as visible through skin (veins, muscle) — never as a medical illustration overlay' },
    { element: 'before/after', condition: 'only as two distinct zones of one image — never as a morphing/blend effect' },
  ],

  exclusions: {
    bannedPhrases: [
      { pattern: /glowing\s*(cell|molecule|dna|vitamin|nutrient)/gi, replacement: 'a close-up of raw food ingredients on a cutting board' },
      { pattern: /digital\s*(body|scan|health\s*metric)/gi, replacement: 'a worn bathroom scale on cracked tile' },
      { pattern: /abstract\s*(wellness|health|vitality)/gi, replacement: 'a person mid-exhale, sweat visible, eyes closed' },
    ],
    negativePhrases: [
      'glowing cell', 'DNA helix', 'molecular visualization',
      'digital body scan', 'health metric overlay',
      'abstract wellness', 'zen garden', 'lotus flower',
      'stock photo of salad', 'person smiling while exercising',
    ],
  },

  groundingDirective: 'Shot like sports photojournalism or medical documentary. Bodies are real — show effort, texture, and imperfection. No clinical diagrams, no wellness aesthetics, no smiling stock athletes. The body is working, not posing.',
};

const FINANCE: StyleLockProfile = {
  topic: 'finance',

  rules: {
    principle: 'Money is physical and institutional. Show its weight and infrastructure, not its abstraction.',
    allowed: [
      'physical currency — stacked bills, coin piles, a single worn dollar',
      'financial infrastructure — bank vault doors, teller windows, ATM screens',
      'paper — printed statements, tax forms, ledger books, receipts',
      'physical scales, safes, cash registers, adding machines',
      'the texture of old money: leather wallets, brass bank fixtures, marble floors',
    ],
    photographyStyle: 'still life photography meets documentary, overhead angles for objects, tungsten or fluorescent lighting, slightly warm palette',
    materiality: 'paper, leather, brass, marble, ink, aged wood, green felt',
  },

  constraints: [
    { element: 'charts', condition: 'only as physical printouts or newspaper clippings — never as digital/floating elements' },
    { element: 'gold', condition: 'only as physical objects (coins, bars) — never as a color wash or abstract glow' },
  ],

  exclusions: {
    bannedPhrases: [
      { pattern: /money\s*or\s*charts?\s*as\s*physical\s*objects?\s*—\s*crumbling,\s*burning/gi, replacement: 'a tall stack of printed bank statements on a worn desk, one page sliding off the edge' },
      { pattern: /physical\s*destruction.*wealth/gi, replacement: 'a heavy brass safe with the door ajar, interior dark and empty' },
      { pattern: /cascading\s*(like\s*water|money|bills)/gi, replacement: 'a single bill pinned under a glass paperweight' },
      { pattern: /crypto|blockchain\s*visual/gi, replacement: 'a physical ledger book' },
    ],
    negativePhrases: [
      'cryptocurrency visualization', 'blockchain graphic', 'bitcoin symbol',
      'money rain', 'dollar signs floating', 'burning money',
      'stock ticker hologram', 'digital wealth', 'gold particle effect',
      'money explosion', 'cash waterfall',
    ],
  },

  groundingDirective: 'Shot like a still-life photograph for a financial magazine. Money and finance are shown through their physical infrastructure — paper, metal, architecture — not through symbols or effects. Everything could exist on a real desk or in a real building.',
};

const ANIMALS: StyleLockProfile = {
  topic: 'animals',

  rules: {
    principle: 'Animals are real creatures in real environments. Show biology, not mythology. The image must depict the LITERAL subject and behavior from the fact.',
    allowed: [
      'real animal behavior — hunting posture, alert stance, feeding, resting, swimming, flying',
      'natural environments — actual terrain, weather, vegetation, ocean, reef, deep water',
      'physical detail — fur texture, feather barbs, scale patterns, claw marks, fin shape, jaw structure',
      'environmental evidence — tracks, kills, nests, territorial marks',
      'natural light — golden hour, overcast sky, dappled forest light, underwater ambient light',
      'the specific animal species named in the fact — not a generic or different animal',
    ],
    photographyStyle: 'National Geographic wildlife photography, long telephoto lens, fast shutter, natural light, earth tone palette, underwater photography for marine subjects',
    materiality: 'fur, feather, scale, bone, soil, bark, water, ice, stone, coral, sand',
  },

  constraints: [
    { element: 'eye contact', condition: 'powerful but only when the animal is naturally alert — never an anthropomorphized stare' },
    { element: 'dramatic lighting', condition: 'only from natural sources (sun, moon, fire, water surface light) — never studio-lit' },
  ],

  exclusions: {
    bannedPhrases: [
      { pattern: /glowing\s*(eye|fur|feather|scale|sphere|orb|core)/gi, replacement: 'light catching the edge of fur in backlit natural light' },
      { pattern: /mythical|mythological|legendary/gi, replacement: 'wild' },
      { pattern: /spirit\s*animal|totem|symbolic/gi, replacement: 'the animal in its natural behavior' },
      { pattern: /futuristic\s*(UI|HUD|interface|display|overlay)/gi, replacement: 'the animal in its natural habitat' },
      { pattern: /robotic|mechanical|cybernetic|android/gi, replacement: 'natural and biological' },
      { pattern: /hologram|holographic|data\s*overlay|data\s*visualization/gi, replacement: 'the real animal in clear view' },
      { pattern: /energy\s*(core|beam|field|pulse|wave)/gi, replacement: 'natural movement and muscle tension' },
      { pattern: /abstract|symbolic|metaphor|conceptual/gi, replacement: 'literal and realistic' },
      { pattern: /human\s*hand|robotic\s*hand|mechanical\s*hand/gi, replacement: 'the animal in its environment' },
      { pattern: /glowing\s*sphere|energy\s*sphere|orb\s*of\s*light/gi, replacement: 'natural ambient light in the environment' },
    ],
    negativePhrases: [
      'glowing eyes', 'spirit animal', 'mythical creature',
      'fantasy beast', 'anthropomorphic', 'animal wearing clothes',
      'neon animal', 'galaxy fur pattern', 'cosmic animal',
      'animal hybrid', 'magical creature',
      'futuristic HUD', 'sci-fi interface', 'hologram', 'holographic display',
      'data overlay', 'data visualization', 'abstract art',
      'robotic hand', 'mechanical hand', 'human hand holding animal',
      'glowing sphere', 'energy core', 'energy beam',
      'symbolic imagery', 'metaphorical imagery', 'conceptual art',
      'studio backdrop', 'black void background', 'neon lighting',
      'tech overlay', 'digital effect', 'particle effect',
    ],
  },

  groundingDirective: 'Shot like National Geographic wildlife photography. The animal is a real biological organism in its real habitat. No effects, no enhancements, no mythology, no sci-fi, no HUD, no holographic elements. Telephoto lens, natural light, earth tones. For marine subjects, use realistic underwater photography with natural water color and light. The drama comes from biology, not from post-production. The image must depict the SPECIFIC animal species and the SPECIFIC behavior or trait described in the fact.',
};

const SCIENCE: StyleLockProfile = {
  topic: 'science',
  rules: {
    principle: 'Science is physical reality. For natural phenomena, show the phenomenon itself. For lab science, show equipment and process. Never show abstraction.',
    allowed: [
      'real lab equipment — beakers, microscopes, centrifuges, fume hoods',
      'physical specimens — slides, samples, petri dishes, fossils',
      'notebooks with handwritten data, graph paper, calibration charts',
      'protective equipment — goggles, gloves, lab coats (with stains)',
      'observatory domes, telescope arrays, clean room suits',
      'natural phenomena — geological formations, weather events, astronomical objects photographed from observatories',
      'the actual subject of the scientific claim — the organism, the mineral, the phenomenon',
    ],
    photographyStyle: 'scientific documentary, macro photography for detail, institutional fluorescent lighting, clinical palette with occasional amber warmth from instruments. For natural phenomena: nature documentary photography',
    materiality: 'glass, stainless steel, white ceramic, rubber gloves, label tape, graph paper, rock, mineral, water, ice',
  },
  constraints: [
    { element: 'molecule/atom', condition: 'only as physical models (ball-and-stick) on a desk — never as floating digital renders' },
  ],
  exclusions: {
    bannedPhrases: [
      { pattern: /floating\s*(molecule|atom|particle|element)/gi, replacement: 'a ball-and-stick molecular model on a cluttered lab bench' },
      { pattern: /quantum\s*(visual|effect|glow|field)/gi, replacement: 'a complex apparatus of mirrors and lasers on an optics bench' },
      { pattern: /galaxy|nebula|cosmic/gi, replacement: 'a deep-field photograph pinned to a lab wall' },
      { pattern: /futuristic\s*(UI|HUD|interface|display|overlay)/gi, replacement: 'the phenomenon in its natural setting' },
      { pattern: /hologram|holographic|data\s*overlay/gi, replacement: 'the physical specimen or phenomenon' },
      { pattern: /abstract\s*(art|visualization|representation)/gi, replacement: 'realistic documentary photography' },
    ],
    negativePhrases: [
      'floating molecules', 'glowing atoms', 'cosmic nebula background',
      'sci-fi laboratory', 'futuristic lab', 'holographic molecule',
      'periodic table overlay', 'DNA helix render',
      'futuristic HUD', 'data overlay', 'abstract visualization',
      'robotic hand', 'energy core', 'glowing sphere',
      'symbolic imagery', 'conceptual art',
    ],
  },
  groundingDirective: 'Shot like a documentary of real scientific work or natural phenomena. Labs are messy, fluorescent-lit, and full of taped-together equipment. Natural phenomena are photographed as they exist in reality. Science is physical process, not visual effect. No HUD, no holograms, no abstract art.',
};

const EDUCATION: StyleLockProfile = {
  topic: 'education',
  rules: {
    principle: 'Learning is physical effort. Show the work surface, not the abstraction.',
    allowed: [
      'real desks, textbooks, notebooks with handwriting, highlighter marks',
      'chalkboards and whiteboards with real writing',
      'libraries — book spines, reading lamps, study carrels',
      'physical tools — rulers, pencils, erasers with shavings, dog-eared pages',
    ],
    photographyStyle: 'editorial photography of educational spaces, warm tungsten light, shallow depth of field on objects, overhead desk shots',
    materiality: 'paper, wood, chalk dust, pencil graphite, worn leather, yellowed pages',
  },
  constraints: [
    { element: 'screens', condition: 'only as a background element — the primary subject should be physical' },
  ],
  exclusions: {
    bannedPhrases: [
      { pattern: /digital\s*(learning|education|classroom)/gi, replacement: 'a well-worn textbook open to a heavily annotated page' },
      { pattern: /floating\s*(book|knowledge|idea|lightbulb)/gi, replacement: 'a stack of books with papers sticking out of them' },
    ],
    negativePhrases: [
      'floating lightbulb', 'glowing brain', 'digital classroom',
      'virtual reality learning', 'holographic teacher',
      'abstract knowledge visualization',
    ],
  },
  groundingDirective: 'Shot like editorial photography of real educational spaces. Learning leaves physical evidence — notes, worn pages, chalk dust. No digital effects, no abstract representations of knowledge.',
};

const MYTHOLOGY: StyleLockProfile = {
  topic: 'mythology',

  rules: {
    principle: 'Mythology is ancient, carved, and weathered. Show stone, fire, and archaeological reality — never fantasy illustration or sci-fi.',
    allowed: [
      'ancient stone carvings, temple ruins, weathered statues',
      'firelight — torches, braziers, oil lamps casting warm shadows on stone',
      'archaeological environments — excavation sites, museum display cases, cracked pottery',
      'natural landscapes that feel ancient — volcanic rock, cave interiors, dense forest clearings',
      'period-accurate materials — bronze weapons, clay tablets, woven textiles, leather',
      'dramatic natural light — dawn through temple columns, firelight on stone walls',
    ],
    photographyStyle: 'cinematic archaeology photography, warm golden-hour light mixed with deep shadows, medium format film look, earthy desaturated palette with amber highlights',
    materiality: 'carved stone, weathered bronze, clay, volcanic rock, aged wood, tarnished gold, cracked marble, raw linen',
  },

  constraints: [
    { element: 'divine light', condition: 'only as natural sun rays through architecture (god rays) — never as magical glowing auras' },
    { element: 'creatures', condition: 'depicted as ancient-world realism (realistic anatomy, natural lighting, ancient setting) — never as fantasy game art, glowing magic, or sci-fi renders' },
    { element: 'armor/weapons', condition: 'only period-accurate materials and construction — never fantasy-game aesthetics' },
  ],

  exclusions: {
    bannedPhrases: [
      { pattern: /futuristic|sci[\s-]?fi|cyberpunk|neon/gi, replacement: 'ancient and weathered' },
      { pattern: /glowing\s*(rune|symbol|aura|eye|magic|power|energy)/gi, replacement: 'firelight casting warm shadows on carved stone' },
      { pattern: /magical\s*(effect|glow|particle|energy|aura|power)/gi, replacement: 'the amber warmth of a torch illuminating old stone' },
      { pattern: /fantasy\s*(illustration|art|render|creature|landscape)/gi, replacement: 'archaeological photography of ancient remains' },
      { pattern: /digital\s*(effect|render|art|painting)/gi, replacement: 'cinematic documentary photography' },
      { pattern: /laser|hologram|electric|plasma|neon/gi, replacement: 'firelight' },
      { pattern: /floating\s*(object|element|symbol|rune)/gi, replacement: 'carved into weathered stone' },
    ],
    negativePhrases: [
      'futuristic', 'sci-fi', 'cyberpunk', 'neon', 'laser',
      'glowing runes', 'magical aura', 'fantasy illustration',
      'digital art', 'game art', 'concept art',
      'modern clothing', 'modern architecture', 'modern technology',
      'hologram', 'particle effects', 'magic glow', 'energy beam',
      'anime', 'cartoon', 'comic book style',
      'clean render', 'CGI', '3D render',
    ],
  },

  groundingDirective: 'Shot like a cinematic archaeological documentary. Everything in frame is ancient, physical, and weathered by time. Stone, bronze, clay, fire — no magical effects, no fantasy aesthetics, no futuristic elements. The drama comes from scale, age, and natural light on ancient surfaces.',
};

const HISTORY: StyleLockProfile = {
  topic: 'history',

  rules: {
    principle: 'History is physical evidence. Show artifacts, documents, and real places — never dramatized illustrations.',
    allowed: [
      'historical artifacts — documents, maps, tools, clothing, currency',
      'architecture from the period — stone buildings, wooden structures, fortifications',
      'natural environments matching the era — period-accurate landscapes',
      'museum-quality photography of real objects',
      'archival photograph aesthetics — sepia tones, film grain, period-appropriate coloring',
    ],
    photographyStyle: 'museum documentary photography, warm tungsten light on artifacts, shallow depth of field, archival color palette',
    materiality: 'parchment, iron, stone, aged wood, leather, wax seals, tarnished metal, faded ink',
  },

  constraints: [
    { element: 'people', condition: 'only as statues, paintings, or silhouettes — never as costumed actors' },
    { element: 'battle scenes', condition: 'only through aftermath or artifacts (weapons, armor, ruins) — never as action illustrations' },
  ],

  exclusions: {
    bannedPhrases: [
      { pattern: /futuristic|sci[\s-]?fi|cyberpunk|neon|modern/gi, replacement: 'period-accurate and weathered' },
      { pattern: /digital\s*(effect|render|art)/gi, replacement: 'documentary photography' },
      { pattern: /fantasy|magical|mythical/gi, replacement: 'historical' },
    ],
    negativePhrases: [
      'futuristic', 'sci-fi', 'cyberpunk', 'neon',
      'digital art', 'fantasy illustration', 'modern elements',
      'CGI', '3D render', 'game art', 'concept art',
      'anime', 'cartoon',
    ],
  },

  groundingDirective: 'Shot like museum or archaeological documentary photography. Everything is a real physical artifact or location. Period-accurate materials and construction. No dramatization, no fantasy, no modern elements.',
};

/** Fallback for topics without a dedicated profile */
const GENERAL: StyleLockProfile = {
  topic: 'general',
  rules: {
    principle: 'When in doubt, be physical. Every image should look like a real photograph of a real place.',
    allowed: [
      'real environments with visible texture and wear',
      'natural lighting from identifiable sources',
      'physical objects that have weight and occupy space',
      'human subjects with natural poses and expressions',
    ],
    photographyStyle: 'editorial photography, natural light, slight grain, muted earth palette with one accent color',
    materiality: 'real surfaces — wood, metal, concrete, fabric, glass, skin',
  },
  constraints: [],
  exclusions: {
    bannedPhrases: [
      { pattern: /holographic|hologram/gi, replacement: 'a physical display or printed material' },
      { pattern: /floating\s*(in\s*(the\s*)?air|in\s*space|element|object)/gi, replacement: 'resting on a worn surface' },
      { pattern: /glowing\s*(blue|neon|bright|magical)/gi, replacement: 'lit by a single warm practical light source' },
    ],
    negativePhrases: [
      'hologram', 'floating objects', 'magic glow',
      'sci-fi aesthetic', 'fantasy elements', 'abstract digital art',
      'neon lights', 'particle effects', 'light trails',
    ],
  },
  groundingDirective: 'Shot like a photograph, not a render. Everything in the frame must look like it could physically exist. One subject, one idea, one strong light source. No visual effects that a camera cannot capture.',
};

// ─── Registry ────────────────────────────────────────────────────

const STYLE_LOCK_REGISTRY: Record<string, StyleLockProfile> = {
  tech: TECH,
  psychology: PSYCHOLOGY,
  business: BUSINESS,
  health: HEALTH,
  finance: FINANCE,
  animals: ANIMALS,
  science: SCIENCE,
  education: EDUCATION,
  mythology: MYTHOLOGY,
  history: HISTORY,
  general: GENERAL,
};

export function getStyleLock(topic: string): StyleLockProfile {
  return STYLE_LOCK_REGISTRY[topic.toLowerCase()] ?? GENERAL;
}

// ─── Style Lock Application ─────────────────────────────────────

export interface StyleLockResult {
  /** The rewritten intent (with banned phrases replaced) */
  intent: VisualIntent;
  /** Style directives to inject into the prompt */
  styleDirectives: string;
  /** Additional negative phrases from the style lock */
  additionalNegatives: string[];
  /** Which profile was applied */
  appliedProfile: string;
  /** How many phrase replacements were made */
  replacementCount: number;
}

/**
 * Apply style lock to a visual intent.
 *
 * This:
 * 1. Rewrites banned phrases in intent.scene, intent.tension, intent.visualHook
 * 2. Builds a style directive string from rules + grounding
 * 3. Collects additional negative phrases
 */
export function applyStyleLock(
  intent: VisualIntent,
  topic: string,
): StyleLockResult {
  const profile = getStyleLock(topic);
  let replacementCount = 0;

  // Clone intent to avoid mutation
  const rewritten: VisualIntent = {
    scene: intent.scene,
    tension: intent.tension,
    visualHook: intent.visualHook,
    avoid: [...intent.avoid],
  };

  // Apply banned phrase replacements across all text fields
  for (const { pattern, replacement } of profile.exclusions.bannedPhrases) {
    for (const field of ['scene', 'tension', 'visualHook'] as const) {
      const before = rewritten[field];
      rewritten[field] = rewritten[field].replace(pattern, () => {
        replacementCount++;
        return replacement;
      });
    }
  }

  // Build style directives from profile rules
  const styleDirectives = [
    profile.rules.photographyStyle,
    profile.rules.materiality,
    profile.groundingDirective,
  ].join('. ');

  return {
    intent: rewritten,
    styleDirectives,
    additionalNegatives: profile.exclusions.negativePhrases,
    appliedProfile: profile.topic,
    replacementCount,
  };
}

export { STYLE_LOCK_REGISTRY };
