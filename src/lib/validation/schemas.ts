import { z } from 'zod';

// ─── Request Schemas ──────────────────────────────────────────

export const NicheSelectionModeSchema = z.enum(['DISCOVER', 'EXPLORE', 'DIRECT']);

export const CreateChannelInput = z.object({
  nicheMode: NicheSelectionModeSchema.default('DISCOVER'),
  exploreTopic: z.string().optional(),
  directTopic: z.string().optional(),
});

export const GenerateChannelNamesInput = z.object({
  style: z.enum(['descriptive', 'bold', 'minimal', 'personal']).optional(),
});

export const SetChannelNameInput = z.object({
  name: z.string().min(1, 'Channel name is required').max(60, 'Channel name too long'),
});

export const GenerateNichesInput = z.object({
  mode: NicheSelectionModeSchema.optional(),
  topic: z.string().optional(),
});

export const RegenerateMoreInput = z.object({
  intent: z.enum(['more_viral', 'more_niche', 'more_monetizable', 'more_unconventional']),
  existingTitles: z.array(z.string()).optional(),
});

export const SelectNicheInput = z.object({
  nicheOptionId: z.string().min(1, 'Niche option ID is required'),
});

export const SetDirectTopicInput = z.object({
  topic: z.string().min(1, 'Topic is required'),
  refine: z.boolean().default(false),
});

export const RegenerateSlideInput = z.object({
  slideIndex: z.number().int().min(0).max(6), // V2: 7 slides (0-6)
});

// ─── Response Schemas ─────────────────────────────────────────

export const NicheOptionResponse = z.object({
  id: z.string(),
  channelId: z.string(),
  title: z.string(),
  description: z.string(),
  competitionScore: z.number().int().min(1).max(10).optional(),
  viralityScore: z.number().int().min(1).max(10).optional(),
  contentEaseScore: z.number().int().min(1).max(10).optional(),
  monetizationScore: z.number().int().min(1).max(10).optional(),
  rationale: z.string(),
  contentIntent: z.string().nullable(),
  selected: z.boolean(),
  createdAt: z.date(),
});

export const SlideResponse = z.object({
  id: z.string(),
  postId: z.string(),
  slideIndex: z.number().int(),
  role: z.enum(['HOOK', 'SETUP', 'BUILD', 'TWIST', 'INSIGHT', 'CTA']),
  text: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CaptionResponse = z.object({
  id: z.string(),
  postId: z.string(),
  text: z.string(),
  hashtags: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const PostResponse = z.object({
  id: z.string(),
  channelId: z.string(),
  dayIndex: z.number().int(),
  title: z.string(),
  hook: z.string(),
  type: z.enum(['CONTRARIAN', 'CALL_OUT', 'MISTAKE_EXPOSURE', 'HIDDEN_TRUTH']),
  status: z.enum(['DRAFT', 'GENERATED', 'REVIEWED', 'APPROVED']),
  publishDate: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const PostDetailResponse = PostResponse.extend({
  slides: z.array(SlideResponse),
  caption: CaptionResponse.nullable(),
});

export const ValidationIssue = z.object({
  field: z.string(),
  message: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
});

export const ValidationReportResponse = z.object({
  valid: z.boolean(),
  issues: z.array(ValidationIssue),
});

export const ChannelMemoryResponse = z.object({
  id: z.string(),
  channelId: z.string(),
  tone: z.string(),
  aggressionLevel: z.number(),
  style: z.string(),
  avoidPatterns: z.array(z.string()),
  preferredHooks: z.array(z.string()),
  forbiddenWords: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ChannelResponse = z.object({
  id: z.string(),
  name: z.string(),
  niche: z.string().nullable(),
  status: z.enum([
    'DRAFT',
    'NICHE_SELECTED',
    'STRATEGY_DEFINED',
    'POSITIONED',
    'NAMED',
    'HOOKS_GENERATED',
    'CONTENT_GENERATED',
    'COMPLETE',
  ]),
  createdAt: z.date(),
  updatedAt: z.date(),
  memory: ChannelMemoryResponse.nullable(),
  nicheOptions: z.array(NicheOptionResponse),
  posts: z.array(PostResponse),
});

// ─── Content Strategy Schemas ─────────────────────────────────

export const GeneratedContentStrategy = z.object({
  contentIntent: z.string().min(1),
  description: z.string().min(1),
  tone: z.string().min(1),
  hookTypes: z.array(z.string()).min(1),
  audience: z.string().min(1),
});

export const GeneratedContentStrategyOptions = z.object({
  channelTone: z.string().min(1),
  channelAudience: z.string().min(1),
  strategies: z.array(GeneratedContentStrategy).min(2).max(4),
});

/** Stored shape when content pillars are approved (new multi-pillar model) */
export const ContentPillarsData = z.object({
  channelTone: z.string().min(1),
  channelAudience: z.string().min(1),
  pillars: z.array(GeneratedContentStrategy).min(1).max(5),
});

export const ApproveContentStrategyInput = z.object({
  contentStrategy: GeneratedContentStrategy,
});

/** New: approve multiple pillars at once */
export const ApproveContentPillarsInput = z.object({
  pillars: z.array(GeneratedContentStrategy).min(1).max(5),
  channelTone: z.string().optional(),
  channelAudience: z.string().optional(),
});

export const GenerateBatchPostsInput = z.object({
  batchSize: z.number().int().min(1).max(10).default(3),
});

// ─── AI Generation Schemas (for structured output) ────────────

export const ContentIntentSchema = z.enum(['evergreen_fact', 'story', 'general']);

export const GeneratedNicheOptions = z.object({
  options: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      rationale: z.string(),
      contentIntent: ContentIntentSchema.optional(), // explicit content intent for this angle
    })
  ),
});

export const GeneratedHook = z.object({
  text: z.string(),
  type: z.enum(['CONTRARIAN', 'CALL_OUT', 'MISTAKE_EXPOSURE', 'HIDDEN_TRUTH']),
  visualHint: z.string().optional(),
  pattern: z.enum(['CONTRAST', 'MISTAKE', 'MYTH', 'LIST', 'STORY', 'BREAKDOWN', 'OPINION']).optional(),
});

export const GeneratedHooks = z.object({
  hooks: z.array(GeneratedHook),
});

export const RealityGroundedHook = z.object({
  text: z.string().min(1),
  entity_refs: z.array(z.string()).min(1),
  event_summary: z.string().min(1),
  angle: z.enum(['insight', 'controversy', 'irony', 'data']),
});

export const RealityGroundedHooks = z.object({
  hooks: z.array(RealityGroundedHook).min(1),
});

export const KnowledgeGroundedHook = z.object({
  text: z.string().min(1),
  fact_refs: z.array(z.string()).min(1),
  angle: z.enum(['insight', 'surprising', 'myth-busting']),
});

export const KnowledgeGroundedHooks = z.object({
  hooks: z.array(KnowledgeGroundedHook).min(1),
});

export const GeneratedSlide = z.object({
  role: z.enum(['HOOK', 'SETUP', 'BUILD', 'TWIST', 'INSIGHT', 'CTA']),
  text: z.string(),
  fact_refs: z.array(z.string()).optional(),
});

export const GeneratedPost = z.object({
  title: z.string(),
  slides: z.array(GeneratedSlide).length(6),
});

export const GeneratedCaption = z.object({
  text: z.string(),
  hashtags: z.array(z.string()),
});

export const GeneratedArticle = z.object({
  text: z.string().min(150),
});

export const GeneratedChannelNames = z.object({
  names: z.array(
    z.object({
      name: z.string(),
      style: z.enum(['descriptive', 'bold', 'minimal', 'personal']),
      rationale: z.string(),
    })
  ),
});

// ─── V2 Carousel Engine Schemas ──────────────────────────────

export const SlideRoleV2 = z.enum(['OPENER', 'FACT', 'IMPLICATION', 'CTA']);

export const FactType = z.enum([
  'statistic',    // number-driven: "X is 3x more than Y"
  'comparison',   // A vs B: "Rome's colosseum = Yankee Stadium capacity"
  'mechanism',    // how/why something works: "Honey never spoils because..."
  'historical',   // dated event or evolution: "Coffee was banned in 1756"
  'example',      // specific named case: "Wilt Chamberlain averaged 48.5 min"
  'definition',   // precise explanation of a concept or term
]);

// ─── V2 AI Generation Schemas ────────────────────────────────

export const GeneratedSlideV2 = z.object({
  slideNumber:       z.number().int().min(0).max(6),
  role:              SlideRoleV2,
  headline:          z.string().min(20).max(100),
  body:              z.string().max(400),
  supportingDetail:  z.string().nullable(),
  factType:          FactType.nullable(),
  containsNumber:    z.boolean(),
  concretenessScore: z.number().int().min(1).max(5),
  noveltyScore:      z.number().int().min(1).max(5),
  topicEntity:       z.string().nullable(),
  factRefs:          z.array(z.string()).default([]),
});

export const GeneratedCarousel = z.object({
  title:           z.string().min(3).max(60),
  topicConfidence: z.number().int().min(1).max(10),
  slides:          z.array(GeneratedSlideV2).min(6).max(7),
}).refine(
  (data) => data.slides[0]?.role === 'OPENER',
  { message: 'First slide must have role OPENER' }
).refine(
  (data) => data.slides[data.slides.length - 1]?.role === 'CTA',
  { message: 'Last slide must have role CTA' }
).refine(
  (data) => data.slides[data.slides.length - 2]?.role === 'IMPLICATION',
  { message: 'Second-to-last slide must have role IMPLICATION' }
).refine(
  (data) => {
    const middle = data.slides.slice(1, -2);
    return middle.every(s => s.role === 'FACT');
  },
  { message: 'All slides between OPENER and IMPLICATION must have role FACT' }
).refine(
  (data) => data.slides.every((s, i) => s.slideNumber === i),
  { message: 'slideNumber must match array position (0-indexed)' }
).refine(
  (data) => {
    return data.slides
      .filter(s => s.role === 'FACT')
      .every(s => s.factType !== null);
  },
  { message: 'Every FACT slide must specify a factType' }
).refine(
  (data) => {
    return data.slides
      .filter(s => s.role === 'FACT')
      .every(s => s.body.length >= 140);
  },
  { message: 'FACT slide body must be at least 140 characters' }
).refine(
  (data) => {
    const imp = data.slides.find(s => s.role === 'IMPLICATION');
    return imp ? imp.body.length >= 50 : false;
  },
  { message: 'IMPLICATION slide body must be at least 50 characters' }
);

// ─── V2 Pipeline Schemas ─────────────────────────────────────

export const CarouselMode = z.enum(['single_entity', 'thematic_collection']);

export const ConceptType = z.enum([
  'character', 'place', 'object', 'event', 'person',
  'organization', 'phenomenon', 'category', 'pattern',
]);

export const SelectedConcept = z.object({
  mode:             CarouselMode,
  concept:          z.string().min(2).max(100),
  conceptType:      ConceptType,
  angle:            z.enum(['narrow', 'survey']).default('narrow'),
  angleDescription: z.string().default(''),
  suggestedHook:    z.string().nullable().default(null),
  rationale:        z.string().min(1),
});

export const MinedFact = z.object({
  claim:          z.string().min(1),
  evidence:       z.string().min(1),
  entities:       z.array(z.string()).default([]),
  has_number:     z.boolean().default(false),
  has_comparison: z.boolean().default(false),
  source_type:    z.enum(['grounded', 'internal_knowledge']).default('internal_knowledge'),
  fact_ref:       z.string().nullable().optional(),
});

export const MinedFactPool = z.object({
  candidates: z.array(MinedFact).min(1),
});

export const ExpandedFact = MinedFact.extend({
  /** 2–3 sentence expansion: mechanism, context, and a surprising detail. */
  expansion: z.string().min(80).max(600),
});

export const ExpandedFactPool = z.object({
  facts: z.array(ExpandedFact).min(1),
});

export const PatchedSlide = z.object({
  slideIndex:        z.number().int().min(0).max(6),
  role:              SlideRoleV2,
  headline:          z.string().min(20).max(100),
  body:              z.string().max(400),
  supportingDetail:  z.string().nullable(),
  factType:          FactType.nullable(),
  containsNumber:    z.boolean(),
  concretenessScore: z.number().int().min(1).max(5),
  noveltyScore:      z.number().int().min(1).max(5),
  topicEntity:       z.string().nullable(),
  factRefs:          z.array(z.string()).default([]),
});

/**
 * Relaxed schema for gate rewrites — matches the JSON shape that rewrite
 * prompts actually request. Does NOT require slideIndex or role (those are
 * known by the caller and merged back in after parsing).
 *
 * Use this in copy-quality-gate, narrative-coherence-gate, and hook-promise-gate
 * instead of PatchedSlide to avoid the schema mismatch that causes silent failures.
 */
export const RewrittenSlide = z.object({
  headline:          z.string().min(1).max(120),
  body:              z.string().max(500),
  supportingDetail:  z.string().nullable().default(null),
  factType:          FactType.nullable().default(null),
  containsNumber:    z.boolean().default(false),
  concretenessScore: z.number().int().min(1).max(5).default(3),
  noveltyScore:      z.number().int().min(1).max(5).default(3),
  topicEntity:       z.string().nullable().default(null),
});

export const PatchResponse = z.object({
  replacements: z.array(PatchedSlide).min(1).max(7),
});

// ─── Compression Schemas ────────────────────────────────────

export const CompressedSlideDisplay = z.object({
  slideNumber:     z.number().int().min(0).max(6),
  displayTitle:    z.string().min(1).max(80),   // 5–10 words, punchy
  displaySupport:  z.string().max(200),          // FACT: 2-3 sentence flowing paragraph. Others: 8–15 words.
  swipeCta:        z.string().max(40).optional(), // OPENER only: contextual CTA e.g. "Swipe to learn why"
});

export const CompressedCarousel = z.object({
  compressed: z.array(CompressedSlideDisplay).min(6).max(7),
});

/** Relaxed schema for partial compression (non-IMPLICATION slides only). */
export const CompressedCarouselPartial = z.object({
  compressed: z.array(CompressedSlideDisplay).min(1).max(7),
});

// ─── Angle Alignment Evaluation ─────────────────────────────

export const AngleAlignmentEval = z.object({
  aligned: z.boolean(),
  reason:  z.string().min(1).max(300),
});

// ─── Implication Strength Evaluation ────────────────────────

export const ImplicationStrengthEval = z.object({
  specificity:  z.number().int().min(0).max(3),   // number / comparison / named entity
  surprise:     z.number().int().min(0).max(3),   // counter-intuitive or unexpected
  shareability: z.number().int().min(0).max(4),   // would a user send this to a friend?
  score:        z.number().int().min(0).max(10),   // sum of above
  issues:       z.array(z.string()),               // what's wrong (empty if strong)
  improvedVersion: z.object({
    displayTitle:   z.string().min(1).max(80),
    displaySupport: z.string().max(120),
  }).optional(),
});

// ─── V2 Response Schemas ─────────────────────────────────────

export const SlideResponseV2 = z.object({
  id:                z.string(),
  postId:            z.string(),
  slideIndex:        z.number().int(),
  role:              z.enum(['HOOK', 'SETUP', 'BUILD', 'TWIST', 'INSIGHT', 'CTA', 'OPENER', 'FACT', 'IMPLICATION']),
  text:              z.string(),              // Legacy field, present on v1 slides
  headline:          z.string().nullable(),    // V2 field
  body:              z.string().nullable(),    // V2 field
  supportingDetail:  z.string().nullable(),
  factType:          z.string().nullable(),
  containsNumber:    z.boolean(),
  concretenessScore: z.number().int(),
  noveltyScore:      z.number().int(),
  topicEntity:       z.string().nullable(),
  qualityPassed:     z.boolean(),
  displayTitle:      z.string().nullable(),
  displaySupport:    z.string().nullable(),
  createdAt:         z.date(),
  updatedAt:         z.date(),
});

export const PostDetailResponseV2 = PostResponse.extend({
  slides: z.array(SlideResponseV2),
  caption: CaptionResponse.nullable(),
});

// ─── Hook Engine V2 Schemas ──────────────────────────────────

export const HookV2Format = z.enum([
  'contradiction',
  'hidden_truth',
  'mechanism',
  'extreme',
  'threat',
]);

export const GeneratedHookV2 = z.object({
  hook: z.string().min(1),
  format: HookV2Format,
});

export const GeneratedHooksV2 = z.object({
  hooks: z.array(GeneratedHookV2).min(1),
});

export const HookV2Scores = z.object({
  curiosityGap: z.number().int().min(0).max(5),
  clarity: z.number().int().min(0).max(5),
  novelty: z.number().int().min(0).max(5),
  emotionalTrigger: z.number().int().min(0).max(5),
  specificity: z.number().int().min(0).max(5),
  totalScore: z.number().int().min(0).max(25),
});

export const ScoredHookV2 = z.object({
  hook: z.string(),
  scores: HookV2Scores,
});

export const ScoredHooksV2 = z.object({
  hooks: z.array(ScoredHookV2).min(1),
});

export const RefinedHookV2 = z.object({
  original: z.string(),
  improved: z.string(),
});

export const RefinedHooksV2 = z.object({
  hooks: z.array(RefinedHookV2).min(1),
});

/** Final output item from the Hook Engine V2 pipeline */
export const HookEngineV2Output = z.object({
  hook: z.string(),
  scores: HookV2Scores,
  improved: z.string(),
});

export const HookEngineV2Result = z.object({
  hooks: z.array(HookEngineV2Output).min(1),
});

// ─── Hook Fact Validator (LLM-judged) ────────────────────────

export const FactHookVerdict = z.enum(['accept', 'reject', 'borderline']);

export const FactHookFailReason = z.enum([
  'news_event',
  'story_narrative',
  'editorial_framing',
  'person_or_org_led',
  'not_timeless',
  'too_generic',
  'not_fact_based',
]);

export const ValidatedFactHook = z.object({
  hook: z.string(),
  isValidFactHook: z.boolean(),
  verdict: FactHookVerdict,
  failReason: FactHookFailReason.nullable(),
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
});

export const ValidatedFactHooks = z.object({
  hooks: z.array(ValidatedFactHook).min(1),
});

// ─── Inferred Types ───────────────────────────────────────────

export type CreateChannelInput = z.infer<typeof CreateChannelInput>;
export type GenerateChannelNamesInput = z.infer<typeof GenerateChannelNamesInput>;
export type SetChannelNameInput = z.infer<typeof SetChannelNameInput>;
export type GenerateNichesInput = z.infer<typeof GenerateNichesInput>;
export type RegenerateMoreInput = z.infer<typeof RegenerateMoreInput>;
export type SelectNicheInput = z.infer<typeof SelectNicheInput>;
export type SetDirectTopicInput = z.infer<typeof SetDirectTopicInput>;
export type RegenerateSlideInput = z.infer<typeof RegenerateSlideInput>;

export type NicheOptionResponse = z.infer<typeof NicheOptionResponse>;
export type SlideResponse = z.infer<typeof SlideResponse>;
export type CaptionResponse = z.infer<typeof CaptionResponse>;
export type PostResponse = z.infer<typeof PostResponse>;
export type PostDetailResponse = z.infer<typeof PostDetailResponse>;
export type ValidationIssue = z.infer<typeof ValidationIssue>;
export type ValidationReportResponse = z.infer<typeof ValidationReportResponse>;
export type ChannelMemoryResponse = z.infer<typeof ChannelMemoryResponse>;
export type ChannelResponse = z.infer<typeof ChannelResponse>;

export type GeneratedNicheOptions = z.infer<typeof GeneratedNicheOptions>;
export type GeneratedHook = z.infer<typeof GeneratedHook>;
export type GeneratedHooks = z.infer<typeof GeneratedHooks>;
export type GeneratedSlide = z.infer<typeof GeneratedSlide>;
export type GeneratedPost = z.infer<typeof GeneratedPost>;
export type GeneratedCaption = z.infer<typeof GeneratedCaption>;
export type GeneratedChannelNames = z.infer<typeof GeneratedChannelNames>;
export type RealityGroundedHook = z.infer<typeof RealityGroundedHook>;
export type RealityGroundedHooks = z.infer<typeof RealityGroundedHooks>;
export type KnowledgeGroundedHook = z.infer<typeof KnowledgeGroundedHook>;
export type KnowledgeGroundedHooks = z.infer<typeof KnowledgeGroundedHooks>;

// V2 types
export type CarouselMode = z.infer<typeof CarouselMode>;
export type ConceptType = z.infer<typeof ConceptType>;
export type SelectedConcept = z.infer<typeof SelectedConcept>;
export type SlideRoleV2 = z.infer<typeof SlideRoleV2>;
export type FactType = z.infer<typeof FactType>;
export type GeneratedSlideV2 = z.infer<typeof GeneratedSlideV2>;
export type GeneratedCarousel = z.infer<typeof GeneratedCarousel>;
export type MinedFact = z.infer<typeof MinedFact>;
export type MinedFactPool = z.infer<typeof MinedFactPool>;
export type ExpandedFact = z.infer<typeof ExpandedFact>;
export type ExpandedFactPool = z.infer<typeof ExpandedFactPool>;
export type PatchedSlide = z.infer<typeof PatchedSlide>;
export type RewrittenSlide = z.infer<typeof RewrittenSlide>;
export type PatchResponse = z.infer<typeof PatchResponse>;
export type CompressedSlideDisplay = z.infer<typeof CompressedSlideDisplay>;
export type CompressedCarousel = z.infer<typeof CompressedCarousel>;
export type GeneratedArticle = z.infer<typeof GeneratedArticle>;
export type SlideResponseV2 = z.infer<typeof SlideResponseV2>;
export type PostDetailResponseV2 = z.infer<typeof PostDetailResponseV2>;

// Hook Engine V2 types
export type HookV2Format = z.infer<typeof HookV2Format>;
export type GeneratedHookV2 = z.infer<typeof GeneratedHookV2>;
export type GeneratedHooksV2 = z.infer<typeof GeneratedHooksV2>;
export type HookV2Scores = z.infer<typeof HookV2Scores>;
export type ScoredHookV2 = z.infer<typeof ScoredHookV2>;
export type ScoredHooksV2 = z.infer<typeof ScoredHooksV2>;
export type RefinedHookV2 = z.infer<typeof RefinedHookV2>;
export type RefinedHooksV2 = z.infer<typeof RefinedHooksV2>;
export type HookEngineV2Output = z.infer<typeof HookEngineV2Output>;
export type HookEngineV2Result = z.infer<typeof HookEngineV2Result>;
export type FactHookVerdict = z.infer<typeof FactHookVerdict>;
export type FactHookFailReason = z.infer<typeof FactHookFailReason>;
export type ValidatedFactHook = z.infer<typeof ValidatedFactHook>;
export type ValidatedFactHooks = z.infer<typeof ValidatedFactHooks>;

// Content Strategy types
export type GeneratedContentStrategy = z.infer<typeof GeneratedContentStrategy>;
export type GeneratedContentStrategyOptions = z.infer<typeof GeneratedContentStrategyOptions>;
export type ApproveContentStrategyInput = z.infer<typeof ApproveContentStrategyInput>;
export type ApproveContentPillarsInput = z.infer<typeof ApproveContentPillarsInput>;
export type ContentPillarsData = z.infer<typeof ContentPillarsData>;
export type GenerateBatchPostsInput = z.infer<typeof GenerateBatchPostsInput>;
