/**
 * Style memo extractor.
 *
 * Reads slide 1's rendered PNG via a vision call and writes a short
 * declarative memo describing the design choices the image model made
 * (palette, typography, layout). The memo is then injected into the prompt
 * for slides 2..N as a STYLE LOCK block — replacing the old reference-image
 * mechanism, which forced an `images.edit` code path and dragged down design
 * energy on follow-up slides.
 *
 * Uses Anthropic's Messages API directly (claude-sonnet-4-5 by default) —
 * it's already the project's primary AI provider, supports vision input via
 * base64 image content, and has separate quota from the OpenAI image-gen
 * key. AnthropicProvider doesn't expose vision today, so this module talks
 * to /v1/messages directly with one small fetch call.
 */
import { logAICall, summarizeInput } from './logger';

const VISION_MODEL = process.env.ANTHROPIC_VISION_MODEL ?? 'claude-sonnet-4-5';
const REQUEST_TIMEOUT_MS = 30_000;

const PROMPT = `You're a design analyst. Look at this Instagram carousel slide and write ONE short paragraph describing its design system in concrete terms.

Cover:
- Headline typography: weight, case (UPPERCASE / Title / lowercase), serif vs sans, color, position on canvas (top-left, top-center, etc.)
- Body typography (if present): weight, case, color, position relative to headline
- Background: how the photograph fills the canvas; any overlay/gradient/dimming used for legibility
- Color palette in plain words (e.g. "warm sepia photo with bright gold serif text", "cool teal scene with white sans-serif top-aligned")

Rules:
- Maximum 220 characters total
- One paragraph, no bullets, no headers, no quotes
- Concrete and declarative ("white serif headline top-left over warm sepia photo with subtle gradient") — not flowery ("evocative editorial mood reminiscent of Renaissance painting")
- Do NOT mention what the photo's subject is — only the design treatment
- Do NOT include the slide's actual headline text
- Begin directly with the description, no preamble`;

export async function extractDesignMemo(slidePng: Buffer): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required for style-memo extraction');

  const startTime = Date.now();
  const base64 = slidePng.toString('base64');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: 220,
        temperature: 0.2,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Anthropic vision call failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json() as { content?: Array<{ type: string; text?: string }> };
  const textBlock = data.content?.find(b => b.type === 'text');
  const raw = (textBlock?.text ?? '').trim();
  const memo = raw.length > 220 ? raw.slice(0, 219).trim() + '…' : raw;

  logAICall({
    provider: 'anthropic-vision',
    model: VISION_MODEL,
    task: 'extractDesignMemo',
    inputSummary: summarizeInput(PROMPT),
    durationMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  });

  console.log(`[StyleMemo] (${memo.length}c) ${memo}`);
  return memo;
}
