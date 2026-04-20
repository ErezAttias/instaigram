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
    '  1. First slide: type "hook" — { "type":"hook", "title":"..." }',
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
    '  • title: 6–16 words. A complete, interesting fact — not a label or teaser.',
    '  • Must contain an action verb (earned, discovered, broke, created, banned, etc.)',
    '  • Must include a specific number, name, or concrete detail',
    '  • The title alone must teach the reader something surprising',
    '  • Vary how titles open across the 4 facts — mix numbers, names, and contrasts',
    '',
    '═══ OTHER FIELDS ═══',
    '',
    '  • content (content slides only): 1–3 sentences expanding the title. Include the mechanism, context, or consequence. 100–200 characters.',
    '  • topicEntity: the specific subject of THIS slide (≤30 chars). E.g. "Viggo Mortensen", "honey preservation", "Oxford University".',
    '  • factType: one of "statistic", "comparison", "mechanism", "historical", "example", "definition".',
    '  • Each content slide = one idea. No lists, no meta-commentary, no "Did you know".',
    '',
    'Respond with ONLY the JSON object. No markdown fences.',
  ].join('\n');
}

// ─── Adapter: ModelResponse → PipelineResult ────────────────

function adaptToPipelineResult(slides: ModelSlide[], topic: string, layout?: 'DETAILED' | 'BOLD'): PipelineResult {
  const v2Slides: GeneratedSlideV2[] = slides.map((s, i) => {
    if (s.type === 'hook') {
      return baseSlide(i, 'OPENER', s.title, '', null, null);
    }
    if (s.type === 'cta') {
      return baseSlide(i, 'CTA', s.title, '', null, null);
    }
    return baseSlide(i, 'FACT', s.title, s.content, s.topicEntity, s.factType);
  });

  const compressedSlides: CompressedSlideDisplay[] = slides.map((s, i) => ({
    slideNumber: i,
    displayTitle: s.title,
    displaySupport: s.type === 'content' ? s.content : '',
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
