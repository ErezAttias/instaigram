/**
 * Evergreen Fact Validator
 *
 * Deterministic, code-level enforcement that a hook describes a timeless,
 * verifiable fact — NOT a story, narrative, person, event, or editorial.
 *
 * Two-axis validation:
 *   1. REJECT hooks that contain non-fact patterns (people, orgs, narrative framing)
 *   2. REQUIRE at least one positive fact signal (biological trait, mechanism, comparison, etc.)
 *
 * This runs BEFORE scoring. Hooks that fail are permanently removed —
 * no backfilling, no second chances.
 */

// ─── REJECTION PATTERNS ──────────────────────────────────────
// If ANY of these match, the hook is not an evergreen fact.

interface RejectRule {
  name: string;
  pattern: RegExp;
}

const REJECT_RULES: RejectRule[] = [
  // ── Named people ──────────────────────────────────────────
  // Catches "Elon Musk", "Jane Goodall", "David Attenborough", etc.
  // Heuristic: two+ capitalized words in sequence that aren't at sentence start
  // Also catches explicit name patterns.
  { name: 'named_person_possessive', pattern: /[A-Z][a-z]+(?:\s[A-Z][a-z]+)*'s\b/ },
  { name: 'named_person_mid_sentence', pattern: /\s[A-Z][a-z]{2,}\s[A-Z][a-z]{2,}(?:\s|'|$)/ },

  // ── Named organizations ───────────────────────────────────
  // Case-sensitive for short acronyms (WHO, UN, CDC) to avoid matching pronouns ("who knew?")
  { name: 'organization', pattern: /\b(SeaWorld|Sea World|National Geographic|Nat Geo|Discovery Channel|Greenpeace|ASPCA)\b/i },
  { name: 'organization_acronym', pattern: /\b(NASA|WWF|PETA|NOAA|WHO|CDC|FBI|CIA|UNESCO|BBC|PBS|IUCN)\b/ },

  // ── Narrative / editorial framing ─────────────────────────
  { name: 'narrative_word', pattern: /\b(story|stories|moment|tale|journey|saga|chronicle|memoir|episode|chapter|plot|twist)\b/i },
  { name: 'editorial_word', pattern: /\b(revealed|exposé|exposed|controversial|controversy|debate|stance|opinion|claim|argues?|critics?|backlash|outrage|scandal|drama)\b/i },
  { name: 'viral_word', pattern: /\b(viral|trending|famous|celebrity|star|icon|iconic|legendary)\b/i },
  { name: 'event_word', pattern: /\b(trial|trials|show|shows|campaign|campaigns|announcement|launch|premiere|ceremony|conference|summit|rally|protest|movement)\b/i },

  // ── Possessive narrative ("X's Y") for non-species subjects ─
  // "A cat's tongue" is fine. "SeaWorld's orca" is not.
  // We catch org/person possessives above; this catches remaining editorial possessives.
  { name: 'possessive_editorial', pattern: /\b(government|company|brand|CEO|founder|president|director|scientist|researcher|expert|professor|doctor|Dr\.|activist)'s\b/i },

  // ── Reporting / attribution ───────────────────────────────
  { name: 'attribution', pattern: /\b(according to|report(s|ed)?|study\s+(says|shows|finds|found|suggests)|survey\s+(says|shows|finds|found)|scientists?\s+(say|says|believe|claim|found|think|suggest)|researchers?\s+(say|says|believe|claim|found|think|suggest)|experts?\s+(say|says|believe|claim|warn))\b/i },
  { name: 'hedged_claim', pattern: /\b(may\s+have|might\s+be|could\s+be|is\s+believed\s+to|is\s+thought\s+to|is\s+said\s+to)\b/i },

  // ── Temporal / recency (reinforced from news filter) ──────
  { name: 'temporal', pattern: /\b(latest|recent(ly)?|currently|now|today|this\s+(year|month|week)|last\s+(year|month|week))\b/i },
  { name: 'year_reference', pattern: /\b(19|20)\d{2}\b/ },

  // ── Location-specific framing ─────────────────────────────
  // "found in Madagascar" is borderline — a fact about habitat is OK,
  // but "found in [city/zoo]" is news. We ban the most common news patterns.
  { name: 'location_news', pattern: /\b(spotted\s+in|sighted\s+in|arrived?\s+in|born\s+(in|at)|relocated\s+to|escaped\s+from)\b/i },

  // ── Imperative/call-to-action (not a fact) ────────────────
  { name: 'imperative_cta', pattern: /^(watch|see|look|check\s+out|meet|follow|subscribe|share|save)\b/i },

  // ── Question-only hooks (no fact stated) ──────────────────
  // "Why do flamingos stand on one leg?" states no fact. Pure questions are lazy.
  { name: 'pure_question', pattern: /^(why|how|what|when|where|who|which|is|are|do|does|can|could|did|will|would|should)\b.*\?$/i },
];

// ─── POSITIVE FACT SIGNALS ───────────────────────────────────
// A valid evergreen fact hook must match at least ONE of these.
// These detect the structural hallmarks of factual claims.

interface FactSignal {
  name: string;
  pattern: RegExp;
}

const FACT_SIGNALS: FactSignal[] = [
  // ── Numbers / measurements ────────────────────────────────
  // "A blue whale's heart weighs 400 pounds" — concrete, verifiable
  { name: 'number', pattern: /\b\d+(\.\d+)?\s*(x|times|percent|%|pounds?|lbs?|kg|km|mph|miles?|feet|ft|inches?|cm|mm|meters?|hours?|minutes?|seconds?|days?|years?|months?|weeks?|gallons?|liters?|tons?|degrees?|celsius|fahrenheit)\b/i },
  { name: 'multiplier', pattern: /\b\d+x\b|\b\d+\s+times\b/i },
  { name: 'bare_number', pattern: /\b\d{2,}\b/ }, // Any number 10+ (e.g. "3 hearts" uses single digit, caught below)

  // ── Biological / anatomical terms ─────────────────────────
  { name: 'biology', pattern: /\b(heart|hearts|brain|brains|blood|eye|eyes|tongue|tongues|teeth|tooth|bone|bones|skin|fur|feather|feathers|wing|wings|tail|tails|leg|legs|foot|feet|paw|paws|hoof|hooves|lung|lungs|organ|organs|cell|cells|muscle|muscles|nerve|nerves|venom|poison|horn|horns|claw|claws|beak|beaks|antenna|antennae|tentacle|tentacles|fin|fins|gill|gills|shell|shells|spine|spines|jaw|jaws|stomach|intestine|liver|kidney|rib|ribs|skull|pelvis|finger|fingerprint|fingerprints|thumb|nostril|nostrils|eyelid|eyelids|pupil|retina|cochlea|ear|ears|snout|trunk|tusk|tusks|whisker|whiskers|scale|scales|quill|quills|stinger|proboscis|knee|knees|elbow|wrist|ankle|hip|shoulder|neck|stripe|stripes|spot|spots|wrinkle|wrinkles|pouch|web|webs|silk|cocoon|chrysalis|larva|larvae|egg|eggs)\b/i },

  // ── Behavioral / biological processes ─────────────────────
  { name: 'behavior', pattern: /\b(sleep|hunt|eat|breathe|swim|fly|run|jump|climb|dig|hibernate|migrate|mate|communicate|purr|sting|bite|camouflage|regenerate|glow|echolocat|photosynthe|metaboli|digest|absorb|secrete|produce|emit|sense|detect|navigate|pollinate|remember|forget|recognize|learn|sweat|shed|molt|hatch|nest|groom|forage|burrow|spray|sting|heal|grow|shrink|float|sink|roll|spin|vibrate|flash|survive|endure|withstand|resist|adapt|evolve|change\s+color|shed\s+(skin|fur|feathers?))\b/i },

  // ── Memory / cognition / senses ────────────────────────────
  { name: 'cognition', pattern: /\b(memory|memories|brain\s+size|intelligence|self-aware|problem.solv|tool.use|count|math|recogni[zs]e|faces?)\b/i },
  { name: 'senses', pattern: /\b(see|sees|sight|vision|blind|deaf|hear|hears|hearing|smell|smells|taste|tastes|touch|feel|feels|infrared|ultraviolet|ultrasound|sonar|echolocation|electrorecept|magnetorecept|thermorecept)\b/i },

  // ── Comparison structures ─────────────────────────────────
  { name: 'comparison', pattern: /\b(than|faster|slower|bigger|smaller|heavier|lighter|stronger|weaker|longer|shorter|hotter|colder|louder|older|younger|more\s+than|less\s+than|as\s+(big|small|fast|strong|heavy|long|old)\s+as|the\s+size\s+of|outrun|outweigh|outlive|outperform)\b/i },

  // ── Mechanism / causation ─────────────────────────────────
  { name: 'mechanism', pattern: /\b(because|due\s+to|in\s+order\s+to|allows?\s+(them|it)|enables?|caus(es?|ing)|result(s|ing)?\s+(in|from)|evolved?\s+to|adapted?\s+to|designed\s+to)\b/i },

  // ── Negation of misconception ─────────────────────────────
  { name: 'misconception', pattern: /\b(aren't|isn't|don't|doesn't|can't|cannot|actually|not\s+actually|wrong\s+about|myth|misconception|contrary\s+to)\b/i },

  // ── Species / taxonomic terms ─────────────────────────────
  { name: 'species', pattern: /\b(species|mammal|reptile|amphibian|insect|arachnid|crustacean|mollusk|marsupial|primate|predator|prey|parasite|bacteria|virus|fungus|fungi|plant|organism|vertebrate|invertebrate)\b/i },

  // ── Physical / material properties ────────────────────────
  { name: 'property', pattern: /\b(spoils?|rots?|decompose[sd]?|dissolves?|melts?|freezes?|boils?|evaporates?|crystallizes?|ferments?|corrodes?|oxidizes?|edible|inedible|toxic|venomous|poisonous|flammable|transparent|opaque|luminescen|bioluminescen|fluorescen|waterproof|fireproof|magnetic|elastic|rigid|flexible|brittle|soluble|insoluble|moisture|acidic|alkaline)\b/i },

  // ── Color / appearance (factual claims about coloration) ───
  { name: 'appearance', pattern: /\b(pink|blue|red|green|black|white|transparent|striped|spotted|patterned|colorful|iridescent|albino|pigment|coloration|markings?)\b/i },

  // ── Diet / nutrition ──────────────────────────────────────
  { name: 'diet', pattern: /\b(diet|eat|feed|consume|prey\s+on|herbivore|carnivore|omnivore|nectar|pollen|plankton|krill|shrimp|algae|grass|fruit|blood|sap|carrion|insects?)\b/i },

  // ── Scientific properties ─────────────────────────────────
  { name: 'science', pattern: /\b(temperature|pressure|gravity|density|frequency|wavelength|velocity|acceleration|energy|force|voltage|magnetic|electric|chemical|molecular|atomic|photon|neuron|DNA|RNA|protein|enzyme|hormone|chromosome|genome|element|compound|reaction|fusion|fission)\b/i },

  // ── Small numbers with units (catches "3 hearts", "2 stomachs") ─
  { name: 'small_count', pattern: /\b[2-9]\s+(heart|brain|stomach|eye|wing|leg|tongue|horn|lung|chamber|tentacle|antenna)s?\b/i },

  // ── Taxonomy / classification facts ───────────────────────
  { name: 'taxonomy', pattern: /\b(called\s+a\s+|known\s+as\s+|classified\s+as\s+|belong\s+to|related\s+to|type\s+of|kind\s+of|family\s+of|order\s+of|genus|phylum)\b/i },

  // ── Lifespan / temporal biological facts ──────────────────
  { name: 'lifespan', pattern: /\b(live\s+for|lives?\s+up\s+to|lifespan|life\s+span|years?\s+old|age\s+of|oldest|youngest|gestation|pregnant|pregnancy|incubat)\b/i },
];

// ─── Public API ──────────────────────────────────────────────

export interface FactValidationResult {
  valid: boolean;
  rejections: string[];  // names of reject rules that fired
  factSignals: string[]; // names of fact signals found
  reason: string;        // human-readable summary
}

/**
 * Validate whether a hook is an evergreen fact.
 *
 * Returns { valid: true } only if:
 *   1. Zero reject rules fired
 *   2. At least one fact signal is present
 */
export function isEvergreenFact(hookText: string): FactValidationResult {
  // Step 1: Check all rejection rules
  const rejections: string[] = [];
  for (const rule of REJECT_RULES) {
    if (rule.pattern.test(hookText)) {
      rejections.push(rule.name);
    }
  }

  if (rejections.length > 0) {
    return {
      valid: false,
      rejections,
      factSignals: [],
      reason: `rejected: ${rejections.join(', ')}`,
    };
  }

  // Step 2: Check for positive fact signals
  const factSignals: string[] = [];
  for (const signal of FACT_SIGNALS) {
    if (signal.pattern.test(hookText)) {
      factSignals.push(signal.name);
    }
  }

  if (factSignals.length === 0) {
    return {
      valid: false,
      rejections: [],
      factSignals: [],
      reason: 'no_fact_signal: hook contains no biological, numerical, comparative, or mechanistic content',
    };
  }

  return {
    valid: true,
    rejections: [],
    factSignals,
    reason: `valid: ${factSignals.join(', ')}`,
  };
}
