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
  slides: z.array(ModelSlide).min(6).max(6),
});

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

  const systemPrompt = 'You are an Instagram content strategist. Create engaging carousel posts.';
  const userPrompt = buildPrompt(topic, channelNiche, memory?.tone);

  const raw = await callAnthropic(ANTHROPIC_MODEL, systemPrompt, userPrompt);
  const parsed = parseJson(raw);
  const result = ModelResponse.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`[simple] schema validation failed — ${issues} | raw: ${raw.slice(0, 400)}`);
  }

  return adaptToPipelineResult(result.data.slides, topic, layout);
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
    'Rules:',
    '  • title: punchy, specific. ~3–12 words.',
    '  • content (content slides only): 1–2 sentences. Specific, surprising, conversational. Around 100–200 characters.',
    '  • topicEntity (content slides only): the specific subject of THIS slide (≤30 chars). E.g. "octopus heart", "Cleopatra", "caffeine molecule".',
    '  • factType (content slides only): one of "statistic", "comparison", "mechanism", "historical", "example", "definition".',
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

  const isBold = layout === 'BOLD';
  const compressedSlides: CompressedSlideDisplay[] = slides.map((s, i) => ({
    slideNumber: i,
    displayTitle: s.title,
    displaySupport: s.type === 'content' && !isBold ? s.content : '',
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
