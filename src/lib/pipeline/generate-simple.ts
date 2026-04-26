/**
 * Simple one-shot carousel pipeline — the replacement for the old 9-step pipeline.
 *
 * One LLM call to Claude Sonnet 4.5. No fact mining, no curation, no validation,
 * no patch loop, no compression step. Output is rendered-ready.
 *
 * This function preserves the `PipelineParams` / `PipelineResult` contract so the
 * six downstream callers (standalone-carousel-service, post-service,
 * regeneration-service, post-batch-streaming, post-service-streaming, etc.) work
 * unchanged. Removed fields (expandedFacts, fallback, selectedFacts) are stubbed.
 */

import { z } from 'zod';
import type { AIProvider } from '@/lib/ai/types';
import type {
  GeneratedCarousel,
  GeneratedSlideV2,
  ExpandedFact,
  CompressedSlideDisplay,
  MinedFact,
  CarouselMode,
  FactType,
} from '@/lib/validation/schemas';

// Inlined to avoid coupling to the soon-to-be-deleted old pipeline.
export interface CarouselValidationReport {
  passed: boolean;
  score: number;
  slideResults: unknown[];
  hardFails: unknown[];
  softFlags: unknown[];
  slidesToRegenerate: number[];
}

// ─── Public shape (unchanged from old pipeline) ─────────────

export interface PipelineParams {
  topic: string;
  hook: {
    text: string;
    type: string;
  };
  knowledgeFacts?: Array<{ id: string; text: string; entities: string[] }>;
  memory?: {
    tone?: string;
    aggressionLevel?: number;
    style?: string;
    avoidPatterns?: string[];
    forbiddenWords?: string[];
  };
  channelNiche?: string;
  channelName?: string;
  pattern?: string;
  mode?: CarouselMode;
  concept?: string;
  usedConcepts?: string[];
  direction?: string;
  layout?: 'DETAILED' | 'BOLD';
}

export interface PipelineResult {
  carousel: GeneratedCarousel;
  validation: CarouselValidationReport;
  qualityWarning: boolean;
  patchedSlideIndices: number[];
  selectedFacts: MinedFact[];
  expandedFacts: ExpandedFact[];
  compressedSlides: CompressedSlideDisplay[];
  mode: CarouselMode;
  concept: string;
  fallback?: {
    level: 'none' | 'skip_evaluation' | 'skip_compression' | 'replace_implication' | 'safe_minimal';
    reason: string;
    stageErrors: Array<{ stage: string; error: string }>;
  };
}

// ─── LLM response schema ────────────────────────────────────

const FactTypeEnum = z.enum([
  'statistic',
  'comparison',
  'mechanism',
  'historical',
  'example',
  'definition',
]);

const HookSlide = z.object({
  type: z.literal('hook'),
  title: z.string(),
  swipeCta: z.string().optional(),
});

const ContentSlide = z.object({
  type: z.literal('content'),
  title: z.string(),
  content: z.string(),
  topicEntity: z.string(),
  factType: FactTypeEnum,
});

const CtaSlide = z.object({
  type: z.literal('cta'),
  title: z.string(),
});

const ModelSlide = z.discriminatedUnion('type', [HookSlide, ContentSlide, CtaSlide]);
type ModelSlide = z.infer<typeof ModelSlide>;

const ModelResponse = z.object({
  slides: z.array(ModelSlide).min(3).max(12),
});

/** Trim to exactly 6 slides: hook first, cta last, 4 content in between. */
function normalizeTo6(slides: ModelSlide[]): ModelSlide[] {
  const hook = slides.find(s => s.type === 'hook');
  const cta = slides.find(s => s.type === 'cta');
  const contents = slides.filter(s => s.type === 'content').slice(0, 4);
  while (contents.length < 4 && contents.length < slides.length) {
    const extra = slides.find(s => s.type !== 'hook' && s.type !== 'cta' && !contents.includes(s as never));
    if (!extra) break;
    contents.push(extra as never);
  }
  const result: ModelSlide[] = [];
  if (hook) result.push(hook);
  result.push(...contents);
  if (cta) result.push(cta);
  return result.slice(0, 6);
}

// ─── Public API ─────────────────────────────────────────────

const ANTHROPIC_MODEL = 'claude-sonnet-4-5';

/**
 * Generate a carousel via a single Claude Sonnet 4.5 call.
 *
 * @param params - topic is required. `channelNiche` and `memory.tone` are injected
 *                 into the prompt. All other fields (hook, concept, mode, direction,
 *                 knowledgeFacts, pattern, memory.avoidPatterns, memory.forbiddenWords)
 *                 are intentionally ignored — the old pipeline over-constrained the model.
 * @param _ai    - unused. The new pipeline calls Anthropic directly. Kept for signature
 *                 compatibility with existing callers.
 */
export async function generateCarousel(
  params: PipelineParams,
  _ai: AIProvider,
): Promise<PipelineResult> {
  const { topic, channelNiche, memory, layout } = params;

  const systemPrompt = 'You are an Instagram content expert specializing in viral educational carousels. Your facts must be genuinely surprising, specific, and verifiable — the kind of thing someone would screenshot and send to a friend. Never produce vague summaries or common knowledge.';
  const userPrompt = buildPrompt(topic, channelNiche, memory?.tone);

  const raw = await callAnthropic(ANTHROPIC_MODEL, systemPrompt, userPrompt);
  const parsed = parseJson(raw);
  const result = ModelResponse.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`[simple] schema validation failed — ${issues} | raw: ${raw.slice(0, 400)}`);
  }

  const normalized = normalizeTo6(result.data.slides);
  if (normalized.length < 3) {
    throw new Error(`[simple] too few usable slides after normalize (${normalized.length})`);
  }
  return adaptToPipelineResult(normalized, topic, layout);
}

// ─── Prompt ─────────────────────────────────────────────────

function buildPrompt(topic: string, niche?: string, tone?: string): string {
  const audience = niche ? ` for a ${niche} channel` : '';
  const voice = tone ? ` Use a ${tone} tone.` : '';
  return [
    `Create 6 Instagram carousel slides about "${topic}"${audience}.${voice}`,
    '',
    'Return a JSON object: { "slides": [ ... ] }',
    'The array must contain EXACTLY 6 slides in this order:',
    '  1. First slide: type "hook" — { "type":"hook", "title":"...", "swipeCta":"..." }',
    '  2–5. Four content slides: { "type":"content", "title":"...", "content":"...", "topicEntity":"...", "factType":"..." }',
    '  6. Last slide: type "cta" — { "type":"cta", "title":"..." }',
    '',
    '═══ FACT QUALITY RULES (most important) ═══',
    '',
    'Each content slide must pass the "share test": would someone screenshot this and send it to a friend?',
    '',
    'GOOD facts have ALL of these:',
    '  • A specific number, date, measurement, or named entity',
    '  • A surprising twist, contrast, or counterintuitive outcome',
    '  • Something verifiable — a real event, study, or mechanism',
    '  • A complete claim that teaches something in one sentence',
    '',
    'GOOD examples:',
    '  ✓ "The FBI Once Sent MLK a Letter Urging Him to Kill Himself" (historical, shocking, specific)',
    '  ✓ "Cleopatra Lived Closer to the Moon Landing Than the Pyramids" (comparison, mind-bending)',
    '  ✓ "Honey Found in 3,000-Year-Old Egyptian Tombs Was Still Edible" (specific number, surprising)',
    '  ✓ "Oxford University Is Older Than the Aztec Empire" (comparison, counterintuitive)',
    '  ✓ "Nintendo Was Founded in 1889 — as a Playing Card Company" (specific date, surprising pivot)',
    '',
    'BAD facts — NEVER generate these:',
    '  ✗ Vague labels: "Kubrick\'s Window Creates Unease" (what window? why? no specific detail)',
    '  ✗ Common knowledge: "The Titanic Sank in 1912" (everyone knows this)',
    '  ✗ Subjective claims: "This Movie Changed Cinema Forever" (opinion, not fact)',
    '  ✗ Generic trivia: "Movies Take a Long Time to Make" (so what?)',
    '  ✗ Incomplete: "Toto Earned $125 Weekly" (compared to what? why does this matter?)',
    '',
    '═══ TITLE RULES ═══',
    '',
    '  • title: 6–10 words. ≤55 chars HARD CAP. A complete, interesting fact — not a label or teaser.',
    '  • Long titles get truncated and broken by the image renderer. Tighten relentlessly.',
    '  • Must contain an action verb (earned, discovered, broke, created, banned, etc.)',
    '  • Must include a specific number, name, or concrete detail',
    '  • The title alone must teach the reader something surprising',
    '  • Vary how titles open across the 4 facts — mix numbers, names, and contrasts',
    '',
    '═══ HOOK SLIDE RULES ═══',
    '',
    '  • The hook title may NOT promise a fact count ("6 facts", "5 things", "10 ways").',
    '    The carousel only has 4 fact slides — count claims will be wrong.',
    '    ✗ "Jellyfish: 6 Facts That Will Blow Your Mind" — count is wrong (only 4 facts)',
    '    ✓ "Jellyfish Are Older Than Dinosaurs. Still Here." — single hook, no count',
    '    ✓ "Everything You Think You Know About Jellyfish Is Wrong" — myth-busting',
    '  • Pick ONE hook angle. Do not stack two ("older than dinosaurs AND blow your mind").',
    '',
    '  HOOK swipeCta (REQUIRED on the hook slide):',
    '  • 3–6 words starting with "Swipe". The CTA must point to the SPECIFIC payload the carousel delivers — counts, examples, names, mechanisms — not a generic teaser.',
    '  • ≤40 characters HARD CAP.',
    '  • CRITICAL — DO NOT RESTATE THE HOOK. If the hook title is itself a complete revealing sentence ("Greek Gods Were Way Weirder Than Disney Showed You"), a generic "Swipe to find out" is redundant — the hook already revealed the claim. Point at what the slides ADD instead.',
    '    ✗ "Greek Gods Were Way Weirder Than Disney Showed You" → "Swipe to find out" (redundant — nothing left to find out)',
    '    ✓ "Greek Gods Were Way Weirder Than Disney Showed You" → "Swipe for the weirdest myths"',
    '    ✓ "Greek Gods Were Way Weirder Than Disney Showed You" → "Swipe for 4 examples"',
    '  • CTAs like "Swipe to find out", "Swipe to learn more", "Swipe to see" are BANNED for complete-sentence hooks. They are only acceptable for question or intrigue-stub hooks ("Why Honey Never Expires", "The Hidden Cost of X").',
    '  • Match the hook pattern:',
    '    "Why X Does Y" → "Swipe to learn why"',
    '    "How X Works" → "Swipe to find out how"',
    '    "5 Foods That Destroy Your Gut" → "Swipe to see them"',
    '    "Everything You Think About X Is Wrong" → "Swipe to see the truth"',
    '    "What Happens When You Stop Eating Sugar" → "Swipe to see what happens"',
    '  • Self-check: read the hook title and the swipeCta together. If the CTA promises something the hook already revealed, rewrite it to point at the specific payload (count, examples, names, mechanisms) the next 4 slides will deliver.',
    '',
    '═══ OTHER FIELDS ═══',
    '',
    '  • content (content slides only): a SINGLE FLOWING PARAGRAPH of 1–2 sentences. ≤180 characters HARD CAP.',
    '    Anything over 180 chars gets visibly clipped mid-word in the rendered slide.',
    '    Aim for ~25 words — enough to add real context, not so much it feels padded.',
    '',
    '    THE PARAGRAPH RULE:',
    '    - Sentences MUST connect to each other using causal or explanatory connectives',
    '    - The paragraph must read as ONE cohesive thought, not 2-3 separate factoids',
    '    - Use connectives: because, which, so, letting, making, meaning, — and, — so, since, thanks to, allowing, only for',
    '    - Each sentence should NEED the one before it to make full sense',
    '    - Must include at least one number, named entity, or specific mechanism',
    '    - Must answer "why" or "how" — not just restate the title',
    '',
    '    GOOD flowing paragraph:',
    '      "Delivers 600 mg of venom per bite — the highest yield of any snake — used for hunting rather than defense, since its 2-inch fangs fold flat against the roof of its mouth and snap forward only at the moment of strike."',
    '',
    '    BAD (disconnected sentences):',
    '      "Delivers 600 mg venom in one bite. Used for hunting, not defense. Fangs reach 2 inches long."',
    '      → Three factoids. No connection. Reads like bullet points.',
    '',
    '    REJECT and rewrite if:',
    '    - Sentences are disconnected (no causal or explanatory link)',
    '    - Vague phrasing ("led to chaos", "changed everything", "something happened")',
    '    - Last sentence is abstract interpretation ("symbolizes...", "represents...", "embodies...")',
    '    - No concrete detail — no number, entity, or mechanism',
    '',
    '  • topicEntity: REQUIRED. A SPECIFIC named subject for THIS slide — never the carousel topic itself.',
    '    The image renderer uses this to draw the slide. Generic = generic image. Specific = striking image.',
    '    ✓ "Australian box jellyfish", "Turritopsis dohrnii", "moon jellyfish swarm at Oskarshamn reactor"',
    '    ✗ "jellyfish" (when carousel topic is "facts about jellyfish" — too generic, repeats every slide)',
    '    ✗ null or empty — every fact slide MUST supply one.',
    '    ≤40 chars. Real-world entity (species, person, place, object, event), not a category.',
    '  • factType: one of "statistic", "comparison", "mechanism", "historical", "example", "definition".',
    '  • Each content slide = one idea. No lists, no meta-commentary, no "Did you know".',
    '',
    'Respond with ONLY the JSON object. No markdown fences.',
  ].join('\n');
}

// ─── Adapter: ModelResponse → PipelineResult ────────────────

function adaptToPipelineResult(slides: ModelSlide[], topic: string, layout?: 'DETAILED' | 'BOLD'): PipelineResult {
  const clampCtaText = (t: string) => t.length > 40 ? t.slice(0, 39).trimEnd() + '…' : t;
  const v2Slides: GeneratedSlideV2[] = slides.map((s, i) => {
    if (s.type === 'hook') {
      const slide = baseSlide(i, 'OPENER', s.title, '', null, null);
      if (s.swipeCta && s.swipeCta.trim()) {
        slide.swipeCta = clampCtaText(s.swipeCta.trim());
      }
      return slide;
    }
    if (s.type === 'cta') {
      return baseSlide(i, 'CTA', s.title, '', null, null);
    }
    return baseSlide(i, 'FACT', s.title, s.content, s.topicEntity, s.factType);
  });

  // Hard-clamp display strings here so Sonnet over-runs don't slip past the
  // schema (this adapter doesn't validate). Title cap matches HARD_TITLE_LIMIT
  // in the renderer; support cap matches the schema's max(180).
  const clampTitle = (t: string) => t.length > 55 ? t.slice(0, 54).trimEnd() + '…' : t;
  const clampSupport = (t: string) => t.length > 180 ? t.slice(0, 179).trimEnd() + '…' : t;
  const clampCta = (t: string) => t.length > 40 ? t.slice(0, 39).trimEnd() + '…' : t;

  const compressedSlides: CompressedSlideDisplay[] = slides.map((s, i) => ({
    slideNumber: i,
    displayTitle: clampTitle(s.title),
    displaySupport: s.type === 'content' ? clampSupport(s.content) : '',
    ...(s.type === 'hook' && s.swipeCta ? { swipeCta: clampCta(s.swipeCta) } : {}),
  }));

  const carousel = {
    title: `${topic}`.slice(0, 60),
    topicConfidence: 8,
    slides: v2Slides,
  } as GeneratedCarousel;

  const validation: CarouselValidationReport = {
    passed: true,
    score: 100,
    slideResults: [],
    hardFails: [],
    softFlags: [],
    slidesToRegenerate: [],
  };

  return {
    carousel,
    validation,
    qualityWarning: false,
    patchedSlideIndices: [],
    selectedFacts: [],
    expandedFacts: [],
    compressedSlides,
    mode: 'single_entity',
    concept: topic,
  };
}

function baseSlide(
  slideNumber: number,
  role: 'OPENER' | 'FACT' | 'IMPLICATION' | 'CTA',
  headline: string,
  body: string,
  topicEntity: string | null,
  factType: FactType | null,
): GeneratedSlideV2 {
  return {
    slideNumber,
    role,
    headline: headline.slice(0, 100),
    body: body.slice(0, 400),
    supportingDetail: null,
    factType,
    containsNumber: /\d/.test(body) || /\d/.test(headline),
    concretenessScore: 3,
    noveltyScore: 3,
    topicEntity,
    factRefs: [],
  };
}

// ─── Anthropic REST call ────────────────────────────────────

/** Fallback: read ANTHROPIC_API_KEY directly from .env.local when the system env is empty. */
let _envFileKey: string | undefined;
function getAnthropicKeyFromEnvFile(): string | undefined {
  if (_envFileKey !== undefined) return _envFileKey || undefined;
  try {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.resolve(process.cwd(), '.env.local');
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    _envFileKey = match?.[1]?.trim() ?? '';
  } catch {
    _envFileKey = '';
  }
  return _envFileKey || undefined;
}

async function callAnthropic(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY || getAnthropicKeyFromEnvFile();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 1.0,
      max_tokens: 2000,
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const block = data.content?.find?.((b: { type: string }) => b.type === 'text');
  const text = block?.text;
  if (!text) {
    throw new Error(`Anthropic returned no text block: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return text;
}

function parseJson(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return JSON.parse(cleaned);
}
