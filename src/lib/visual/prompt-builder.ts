/**
 * Prompt Builder — Direct Prompt Style
 *
 * Builds concise ~50-word image prompts for Gemini.
 * Every carousel is a facts carousel — all slides get the same
 * clean, direct prompt style regardless of topic domain.
 */

import { IMAGE_CONSTRAINTS } from './system';

// ─── Input / Output Types ────────────────────────────────────────

export interface PromptBuilderInput {
  /** The slide's role in the carousel (HOOK, FACT, IMPLICATION, CTA, etc.) */
  slideRole: string;
  /** The subject to depict (e.g., "a software engineer at a standing desk") */
  subject: string;
  /** Optional: topic domain for intent tuning (tech, psychology, business, etc.) */
  topic?: string;
  /** Optional: force a specific template ID instead of auto-selecting */
  templateOverride?: string;
  /** Optional: the headline text that will be overlaid (used for layout + intent) */
  headlineText?: string;
  /** Optional: body/supporting text */
  bodyText?: string;
  /**
   * Optional: 1-2 sentence Wikipedia extract for the subject.
   * When provided, injected into the Gemini prompt as a factual anchor so
   * AI-generated images stay grounded in reality (e.g. for real places/people).
   */
  wikipediaExtract?: string;
  /**
   * When true, the image prompt will NOT include the celebrity's name or ask
   * for their likeness. Used as the Gemini fallback for celebrity FACT slides
   * when Wikipedia fails — Gemini's content policy blocks real-person likenesses,
   * so the prompt describes the concept/setting of the fact without the person.
   */
  avoidPersonLikeness?: boolean;
}

export interface LayoutInstruction {
  zone: string;
  position: { x: number; y: number; width: number; height: number };
  alignment: string;
  typography: string;
  color: string;
  content: string;
  lines?: string[];
}

export interface PromptBuilderOutput {
  /** Selected visual template */
  template: {
    id: string;
    name: string;
    description: string;
  };

  /** Complete image generation prompt (structured, layered) */
  imagePrompt: string;

  /** Negative prompt (what to avoid) */
  negativePrompt: string;

  /** The visual intent that was applied */
  intent: { scene: string; tension: string; visualHook: string; avoid: string[] };

  /** The distortion that was injected into the scene */
  distortion: {
    type: string;
    sceneInjection: string;
    compositionDirective: string;
    rationale: string;
  };

  /** Layout instructions for text overlay */
  layout: LayoutInstruction[];

  /** Emphasis analysis for headline (if provided) */
  emphasisAnalysis?: {
    segments: Array<{ text: string; isEmphasis: boolean }>;
  };

  /** Technical image specs */
  imageSpec: {
    width: number;
    height: number;
    aspectRatio: string;
    style: string;
  };

  /** Metadata for debugging/logging */
  meta: {
    slideRole: string;
    subject: string;
    topic: string;
    selectedLighting: string;
    selectedBackground: string;
    moodKeywords: string[];
    tensionType: string;
  };
}

// ─── Direct Prompt Construction ──────────────────────────────────

/**
 * TOPIC → photography style mapping for informational prompts.
 */
const INFORMATIONAL_FEEL: Record<string, string> = {
  animals: 'Wildlife photography, National Geographic style',
  science: 'Scientific documentary photography',
  health: 'Medical or sports documentary photography',
  education: 'Editorial documentary photography',
  mythology: 'Dramatic fine-art photography, cinematic lighting',
  history: 'Historical documentary photography, archival quality',
  tech: 'Clean technology photography, editorial style',
  psychology: 'Conceptual portrait photography, editorial style',
  business: 'Corporate editorial photography',
  finance: 'Editorial business photography',
};

/**
 * TOPIC → asset type description for informational prompts.
 */
const INFORMATIONAL_ASSET_TYPE: Record<string, string> = {
  animals: 'A wildlife-themed social media post for Instagram',
  science: 'A science-themed social media post for Instagram',
  health: 'A health and fitness social media post for Instagram',
  education: 'An educational social media post for Instagram',
  mythology: 'A mythology-themed social media post for Instagram',
  history: 'A history-themed social media post for Instagram',
  tech: 'A technology-themed social media post for Instagram',
  psychology: 'A psychology-themed social media post for Instagram',
  business: 'A business-themed social media post for Instagram',
  finance: 'A finance-themed social media post for Instagram',
};

// Maps place-type keywords to grounded physical visual descriptors.
// These replace the headline text when the headline contains a fantasy-triggering
// proper name (e.g. "Neverland") that Gemini can't disambiguate from fiction.
const PLACE_VISUAL_DESCRIPTORS: Record<string, string> = {
  railroad:   'small-gauge steam railroad winding through private estate grounds',
  railway:    'small-gauge railroad through private estate grounds',
  ranch:      'sprawling private ranch with California landscape',
  estate:     'private estate grounds with manicured gardens and California oaks',
  mansion:    'large private mansion with landscaped grounds',
  zoo:        'private zoo with open-air animal enclosures',
  theater:    'private movie theater interior with rows of red velvet seats',
  theatre:    'private theater interior with stage and seating',
  park:       'private amusement park with rides and pathways',
  amusement:  'private amusement park with rides and walkways',
  attraction: 'private estate attraction with visitors and pathways',
  garden:     'manicured private garden with flower beds and walking paths',
  studio:     'private recording studio interior with mixing console',
  museum:     'private museum interior with display cases',
  gallery:    'private art gallery interior with framed artworks on walls',
  island:     'private island with palm trees and wooden dock',
  hotel:      'private boutique hotel with landscaped courtyard',
  farm:       'private farm with barn, animals, and open fields',
  arena:      'private performance arena interior',
  stadium:    'private outdoor stadium with seating',
  venue:      'private event venue with landscaped exterior',
};

// Proper names that are so strongly associated with fiction that Gemini
// cannot produce realistic imagery when they appear in the prompt.
// Each maps to a neutral geographic/descriptive replacement.
const FANTASY_NAME_REPLACEMENTS: Record<string, string> = {
  'neverland': "celebrity's private California ranch estate",
};

/**
 * Sanitize a text string by replacing fantasy-triggering proper names
 * with neutral descriptors so Gemini stays grounded in reality.
 */
function sanitizeFantasyNames(text: string): string {
  let result = text;
  for (const [name, replacement] of Object.entries(FANTASY_NAME_REPLACEMENTS)) {
    // Case-insensitive, whole-word replacement
    result = result.replace(new RegExp(`\\b${name}\\b`, 'gi'), replacement);
  }
  return result;
}

/**
 * For a real-place FACT slide, build the scene description from
 * physical visual descriptors rather than the headline text.
 * This avoids feeding fantasy-triggering proper names (e.g. "Neverland")
 * directly into the scene anchor.
 */
function buildRealPlaceSceneDescription(
  headlineText: string,
  bodyText: string | undefined,
  subject: string,
): string {
  const text = `${headlineText} ${bodyText ?? ''}`.toLowerCase();

  for (const [keyword, descriptor] of Object.entries(PLACE_VISUAL_DESCRIPTORS)) {
    if (text.includes(keyword)) {
      return `${subject}'s ${descriptor}`;
    }
  }

  // Fallback: sanitize fantasy names and use the headline
  return `${subject}'s ${sanitizeFantasyNames(headlineText)}, real California estate`;
}

/**
 * Build a concise, direct image prompt for celebrity slides.
 * Uses the person's name explicitly so Flux can render a realistic likeness.
 *
 * OPENER/CTA: cinematic portrait — person as the hero
 * FACT: person in context of the specific fact (editorial / photojournalism)
 * FACT (real place): physical descriptor scene, documentary style, no fantasy
 */
function buildCelebrityPrompt(
  headlineText: string,
  bodyText: string | undefined,
  subject: string,
  role: string,
  wikipediaExtract?: string,
): string {
  const isFactSlide = role === 'FACT' || role === 'BUILD';

  // For real-place FACT slides, build from physical descriptors — not the headline.
  // Feeding "Neverland" or similar fantasy-sounding names into the scene anchor
  // causes Gemini to generate fiction regardless of negative prompts.
  const placeSlide = isFactSlide && isRealPlaceSlide(headlineText, bodyText);

  let sceneDescription: string;
  if (placeSlide) {
    sceneDescription = buildRealPlaceSceneDescription(headlineText, bodyText, subject);
  } else if (isFactSlide) {
    sceneDescription = `${subject}: ${headlineText}`;
  } else {
    // OPENER/CTA: bands/groups → performance scene; solo artists → cinematic portrait
    const isBandOrGroup = /\b(band|group|duo|trio|quartet|brothers|sisters)\b/i.test(subject);
    sceneDescription = isBandOrGroup
      ? `${subject}, live concert performance, stage lights, energetic crowd, iconic rock band`
      : `${subject}, dramatic cinematic portrait, editorial photography, intense gaze`;
  }

  // For real-place slides, skip the body context sentence — it almost always
  // contains the same fantasy-triggering proper name and recontaminates the prompt.
  const contextSentence = (isFactSlide && !placeSlide)
    ? bodyText?.split('.').filter(s => s.trim())[0]?.trim()
    : undefined;

  const styleClause = placeSlide
    ? 'Photorealistic documentary photography, real estate photography style, natural daylight, grounded in reality.'
    : 'High-end editorial photography, photorealistic, sharp facial detail.';
  const noFantasyClause = placeSlide
    ? 'No fantasy elements, no CGI, no surreal imagery, no floating objects, no castles, no magic. No text, no watermarks, no labels.'
    : 'No text, no watermarks, no labels.';

  // Inject Wikipedia extract as a factual anchor when present.
  // Truncated to 200 chars to keep total prompt concise.
  const wikiClause = wikipediaExtract
    ? `Wikipedia: ${wikipediaExtract.slice(0, 200)}.`
    : undefined;

  const parts = [
    sceneDescription + '.',
    wikiClause ?? (contextSentence ? contextSentence + '.' : ''),
    styleClause,
    'A celebrity-themed social media post for Instagram.',
    '1:1 aspect ratio.',
    noFantasyClause,
  ].filter(Boolean);

  return parts.join(' ');
}

export function isRealPlaceSlide(headlineText: string, bodyText?: string): boolean {
  const text = `${headlineText} ${bodyText ?? ''}`.toLowerCase();
  return Object.keys(PLACE_VISUAL_DESCRIPTORS).some(kw => text.includes(kw))
    || Object.keys(FANTASY_NAME_REPLACEMENTS).some(kw => text.includes(kw));
}

/** Extract the most useful Wikipedia search term for a real-place slide.
 * Prefers topicEntity if it looks like a place; otherwise extracts the
 * proper-noun prefix from the headline (before the first place keyword). */
export function extractPlaceSearchTerm(
  headlineText: string,
  topicEntity: string | null | undefined,
  subject: string,
): string {
  // Use topicEntity if it already contains a place keyword (e.g. "Neverland Ranch")
  if (topicEntity) {
    const lower = topicEntity.toLowerCase();
    if (
      Object.keys(PLACE_VISUAL_DESCRIPTORS).some(kw => lower.includes(kw)) ||
      Object.keys(FANTASY_NAME_REPLACEMENTS).some(kw => lower.includes(kw))
    ) {
      return topicEntity;
    }
  }

  // Extract the proper-noun cluster before the first place keyword in the headline.
  // "Neverland's Own Railroad System" → "Neverland"
  const COMMON_WORDS = new Set(['own', 'the', 'a', 'an', 'and', 'or', 'its', 'their', 'very', 'most', 'some', 'has', 'had', 'was', 'were']);
  const placeKeys = new Set([
    ...Object.keys(PLACE_VISUAL_DESCRIPTORS),
    ...Object.keys(FANTASY_NAME_REPLACEMENTS),
  ]);
  const words = headlineText.replace(/[''\u2019]s\b/g, '').split(/\s+/);
  const cutIndex = words.findIndex(w => placeKeys.has(w.toLowerCase()));
  const nameWords = (cutIndex > 0 ? words.slice(0, cutIndex) : words)
    .filter(w => /^[A-Z]/.test(w) && !COMMON_WORDS.has(w.toLowerCase()));

  if (nameWords.length > 0) return nameWords.join(' ');

  // Fall back to topicEntity or subject (celebrity name — Wikipedia will find the place via search)
  return topicEntity || subject;
}

/**
 * Build a concise, direct image prompt for informational FACT slides.
 *
 * The old pipeline produced ~400-word prompts full of meta-instructions
 * ("show the behavior from the claim") that Gemini couldn't resolve.
 * Informational facts don't need visual tension, distortion, or style lock —
 * the fact IS the drama.
 *
 * Prompt structure (~50 words):
 *   1. Subject — headline text (the fact itself)
 *   2. Context — first sentence of body text (adds specificity)
 *   3. Feel — photography style for the topic
 *   4. Asset type — social media context
 *   5. Dimensions — 1:1 aspect ratio
 *   6. No-text — content restrictions
 */
function buildInformationalPrompt(
  headlineText: string,
  bodyText: string | undefined,
  topic: string,
  subject: string,
  role: string,
): string {
  const feel = INFORMATIONAL_FEEL[topic] || 'Documentary photography';
  const assetType = INFORMATIONAL_ASSET_TYPE[topic] || 'A social media post for Instagram';

  // OPENER/CTA: use subject as scene description, not the headline.
  // Headlines like "Shark Myths: Fact or Fiction?" are copywriting hooks —
  // Gemini bakes them into the image as text. The subject ("sharks") is
  // what the image should actually depict.
  //
  // FACT: use headline as scene description — it describes the specific
  // fact to illustrate ("Epaulettes Walk on Land").
  const isFactSlide = role === 'FACT' || role === 'BUILD';

  let sceneDescription: string;
  if (isFactSlide) {
    // Prefix with subject to disambiguate species names
    const subjectPrefix = subject ? `${subject}: ` : '';
    sceneDescription = subjectPrefix + headlineText;
  } else {
    // OPENER/CTA: describe the subject visually
    sceneDescription = `${subject}, dramatic close-up, cinematic composition`;
  }

  // Add the first sentence of body text for specificity (FACT slides only).
  const contextSentence = isFactSlide
    ? bodyText?.split('.').filter(s => s.trim())[0]?.trim()
    : undefined;

  const parts = [
    sceneDescription + '.',
    contextSentence ? contextSentence + '.' : '',
    feel + '.',
    assetType + '.',
    '1:1 aspect ratio.',
    'No text, no watermarks, no labels.',
  ].filter(Boolean);

  return parts.join(' ');
}

/**
 * Build a stub PromptBuilderOutput for informational slides.
 * Only `imagePrompt` is consumed downstream — all other fields are stubs.
 */
function buildInformationalOutput(
  input: PromptBuilderInput,
  imagePrompt: string,
  topic: string,
): PromptBuilderOutput {
  return {
    template: { id: 'informational-direct', name: 'Informational Direct', description: 'Concise prompt for informational fact slides' },
    imagePrompt,
    negativePrompt: 'text, watermark, labels',
    intent: { scene: input.headlineText || '', tension: '', visualHook: '', avoid: [] },
    distortion: { type: 'temporal-tension', sceneInjection: '', compositionDirective: '', rationale: 'informational_direct_prompt' },
    layout: [],
    imageSpec: {
      width: IMAGE_CONSTRAINTS.dimensions.width,
      height: IMAGE_CONSTRAINTS.dimensions.height,
      aspectRatio: IMAGE_CONSTRAINTS.aspectRatio,
      style: IMAGE_CONSTRAINTS.quality.style,
    },
    meta: {
      slideRole: input.slideRole.toUpperCase(),
      subject: input.subject,
      topic,
      selectedLighting: 'natural',
      selectedBackground: 'natural-environment',
      moodKeywords: ['realistic', 'natural'],
      tensionType: 'neutral',
    },
  };
}

/**
 * Build a Gemini-safe fallback prompt for celebrity FACT slides.
 *
 * Gemini blocks prompts that request a recognisable likeness of a real person.
 * This prompt describes the visual CONCEPT of the fact (objects, environments,
 * symbolic settings) without naming or depicting the celebrity.
 *
 * Used only when Wikipedia photo lookup fails and Gemini is the fallback.
 */
function buildCelebrityGeminiFallbackPrompt(headlineText: string): string {
  const parts = [
    headlineText + '.',
    'Editorial and documentary photography.',
    'No recognisable celebrities or famous people.',
    'Symbolic and contextual imagery: objects, environments, and settings that visually represent this concept.',
    'A social media post for Instagram. 1:1 aspect ratio.',
    'No text, no watermarks, no labels.',
  ];
  return parts.join(' ');
}

// ─── Main Prompt Builder ─────────────────────────────────────────

/**
 * Build a complete visual specification for a single carousel slide.
 *
 * Every carousel in this product is a facts carousel. All slides use the same
 * concise, direct prompt style — a ~50-word prompt that tells Gemini exactly
 * what to depict. No templates, no visual tension, no distortion, no style lock.
 */
export function buildSlidePrompt(input: PromptBuilderInput): PromptBuilderOutput {
  const { slideRole, subject, headlineText, bodyText, topic, wikipediaExtract, avoidPersonLikeness } = input;
  const role = slideRole.toUpperCase();

  const { detectTopic: _detectTopic } = require('./intent');
  const detectedTopic = _detectTopic({ slideRole: role, topic, headline: headlineText, subject });

  const isFactRole = role === 'FACT' || role === 'BUILD';
  let imagePrompt: string;
  if (detectedTopic === 'celebrity') {
    const promptText = headlineText || subject;
    if (avoidPersonLikeness && isFactRole) {
      // Gemini fallback: describe the concept, not the person
      imagePrompt = buildCelebrityGeminiFallbackPrompt(promptText);
    } else {
      imagePrompt = buildCelebrityPrompt(promptText, bodyText, subject, role, wikipediaExtract);
    }
  } else {
    const promptText = headlineText || subject;
    imagePrompt = buildInformationalPrompt(promptText, bodyText, detectedTopic, subject, role);
  }

  console.log(`[PromptBuilder] Direct prompt (${role}, ${detectedTopic}, ${imagePrompt.length} chars): ${imagePrompt}`);
  return buildInformationalOutput(input, imagePrompt, detectedTopic);
}

/**
 * Build prompts for an entire carousel (array of slides).
 */
export function buildCarouselPrompts(
  slides: Array<{ role: string; subject: string; topic?: string; headlineText?: string; bodyText?: string }>
): PromptBuilderOutput[] {
  return slides.map(slide =>
    buildSlidePrompt({
      slideRole: slide.role,
      subject: slide.subject,
      topic: slide.topic,
      headlineText: slide.headlineText,
      bodyText: slide.bodyText,
    })
  );
}
