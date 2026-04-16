import { z } from 'zod';

/**
 * Simple one-shot carousel generator mirroring the reference strategy verbatim.
 *
 * One LLM call. No validation, no scoring, no post-processing. This exists to
 * A/B the complex pipeline against a naive baseline AND to compare models.
 *
 * Source: CAROUSEL_CONTENT_STRATEGY.md (third-party reference doc).
 */

const HookSlide = z.object({
  type: z.literal('hook'),
  title: z.string(),
  visualPrompt: z.string().optional().default(''),
});

const ContentSlide = z.object({
  type: z.literal('content'),
  title: z.string(),
  content: z.string(),
  visualPrompt: z.string().optional().default(''),
});

const CtaSlide = z.object({
  type: z.literal('cta'),
  title: z.string(),
  visualPrompt: z.string().optional().default(''),
});

export const SimpleSlide = z.discriminatedUnion('type', [HookSlide, ContentSlide, CtaSlide]);
export type SimpleSlide = z.infer<typeof SimpleSlide>;

const SimpleCarousel = z.object({
  slides: z.array(SimpleSlide),
});

export type SimpleModelId =
  | 'gpt-4o'
  | 'claude-sonnet-4-5'
  | 'claude-opus-4-6'
  | 'gemini-2.5-pro';

export interface SimpleCarouselResult {
  modelId: SimpleModelId;
  slides: SimpleSlide[];
  latencyMs: number;
}

export async function generateSimpleCarousel(
  topic: string,
  modelId: SimpleModelId = 'gpt-4o',
  slideCount = 6,
): Promise<SimpleCarouselResult> {
  const started = Date.now();

  const systemPrompt =
    'You are an Instagram content strategist. Create engaging carousel posts.';
  const userPrompt = buildUserPrompt(topic, slideCount);

  const raw = await callModel(modelId, systemPrompt, userPrompt);
  const parsed = parseSlidesJson(raw);

  const result = SimpleCarousel.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`[simple/${modelId}] schema validation failed — ${issues} | raw: ${raw.slice(0, 300)}`);
  }

  return {
    modelId,
    slides: result.data.slides,
    latencyMs: Date.now() - started,
  };
}

function buildUserPrompt(topic: string, slideCount: number): string {
  return [
    `Create ${slideCount} Instagram carousel slides about "${topic}".`,
    'Return a JSON object of the form: { "slides": [ ... ] }',
    'Each slide is one of:',
    '  {"type":"hook","title":"...","visualPrompt":"..."}',
    '  {"type":"content","title":"...","content":"...","visualPrompt":"..."}',
    '  {"type":"cta","title":"...","visualPrompt":"..."}',
    'First slide must be type "hook". Last slide must be type "cta". Middle slides must be type "content".',
    'Content bodies should be 1-2 sentences, specific, surprising, conversational.',
    'Respond with ONLY the JSON object, no markdown fences or commentary.',
  ].join('\n');
}

function parseSlidesJson(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return JSON.parse(cleaned);
}

// ─── Model dispatch ─────────────────────────────────────────

async function callModel(
  modelId: SimpleModelId,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  switch (modelId) {
    case 'gpt-4o':
      return callOpenAI('gpt-4o', systemPrompt, userPrompt);
    case 'claude-sonnet-4-5':
      return callAnthropic('claude-sonnet-4-5', systemPrompt, userPrompt);
    case 'claude-opus-4-6':
      return callAnthropic('claude-opus-4-6', systemPrompt, userPrompt);
    case 'gemini-2.5-pro':
      return callGemini('gemini-2.5-pro', systemPrompt, userPrompt);
  }
}

async function callOpenAI(model: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
      max_tokens: 2000,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty content');
  return content;
}

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
      temperature: 1.0, // Anthropic recommends higher temp for creative; ~equivalent to OpenAI 0.8
      max_tokens: 2000,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const block = data.content?.find?.((b: { type: string }) => b.type === 'text');
  const text = block?.text;
  if (!text) throw new Error(`Anthropic returned no text block: ${JSON.stringify(data).slice(0, 300)}`);
  return text;
}

async function callGemini(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 4000,
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  if (!text) throw new Error(`Gemini returned no text: ${JSON.stringify(data).slice(0, 300)}`);
  return text;
}
