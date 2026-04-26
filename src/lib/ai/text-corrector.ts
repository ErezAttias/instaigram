/**
 * Text-correction pass (Phase 3 of the design-board flow).
 *
 * gpt-image-1 reliably produces beautiful designs but occasionally garbles
 * individual words ("Whitener" → "Whitiner", "Aphrodisiac" → "Aphrodisdaic").
 * Adding spelling rules to the design prompt makes the model retreat to safe
 * generic typography. So instead, we let Phase 1/Phase 2 design freely, then
 * fix any typos here in a surgical edit pass:
 *
 *   1. Send the rendered slide PNG to Claude vision with the intended text.
 *      Claude returns a list of `<rendered>` → `<intended>` diffs, or NONE.
 *   2. If the list is non-empty, call `images.edit` with input_fidelity:'high'
 *      and a prompt that names exactly which words to fix and which to leave
 *      alone. The edit endpoint preserves everything outside the targeted
 *      words.
 */

import OpenAI, { toFile } from 'openai';
import { logAICall, summarizeInput } from './logger';

// Anthropic model used for vision OCR / diff detection.
const VISION_MODEL = process.env.ANTHROPIC_VISION_MODEL ?? 'claude-sonnet-4-5';
// gpt-image-1 model used for the surgical text-fix edit.
const EDIT_MODEL = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1';
const EDIT_QUALITY = (process.env.OPENAI_IMAGE_QUALITY ?? 'high') as
  | 'low' | 'medium' | 'high' | 'auto';

const REQUEST_TIMEOUT_MS = 60_000;

// ─── Step A — vision-OCR diff detection ─────────────────────────

export interface TextDiff {
  rendered: string;
  intended: string;
}

export interface IntendedText {
  headline?: string;
  body?: string;
  swipeCta?: string;
}

const DIFF_PROMPT = (intended: IntendedText) => {
  const lines: string[] = [];
  if (intended.headline) lines.push(`Headline: ${intended.headline}`);
  if (intended.body)     lines.push(`Body: ${intended.body}`);
  if (intended.swipeCta) lines.push(`Swipe CTA: ${intended.swipeCta}`);
  return `Compare the text rendered on this image with the intended text below.

List ONLY words on the image that do NOT match the intended text — be conservative, only flag clear and obvious misspellings or substitutions, not rewordings or stylistic differences. Do not flag missing periods, capitalization differences, or punctuation.

For each typo, output ONE line in this exact format:
"<rendered>" -> "<intended>"

If every word on the image matches the intended text, output a single line: NONE

Output nothing else — no commentary, no preamble.

Intended text:
${lines.join('\n')}`;
};

/**
 * Step A — run a vision OCR + diff against the intended text. Returns the
 * list of words that were rendered incorrectly. Empty array means the image
 * matches the intended text.
 */
export async function detectTextDiffs(
  slidePng: Buffer,
  intended: IntendedText,
): Promise<TextDiff[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required for text-correction OCR');

  const startTime = Date.now();
  const base64 = slidePng.toString('base64');
  const prompt = DIFF_PROMPT(intended);

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
        max_tokens: 400,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
              { type: 'text', text: prompt },
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
    throw new Error(`Anthropic vision diff failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json() as { content?: Array<{ type: string; text?: string }> };
  const textBlock = data.content?.find(b => b.type === 'text');
  const raw = (textBlock?.text ?? '').trim();

  logAICall({
    provider: 'anthropic-vision',
    model: VISION_MODEL,
    task: 'detectTextDiffs',
    inputSummary: summarizeInput(prompt),
    durationMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  });

  if (!raw || /^NONE$/i.test(raw)) return [];

  // Parse lines like:  "WHITINER" -> "WHITENER"
  const diffs: TextDiff[] = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^"([^"]+)"\s*[-–—]?>\s*"([^"]+)"\s*$/);
    if (m && m[1].trim() && m[2].trim() && m[1].trim() !== m[2].trim()) {
      diffs.push({ rendered: m[1].trim(), intended: m[2].trim() });
    }
  }
  return diffs;
}

// ─── Step B — surgical text-fix edit ────────────────────────────

const EDIT_PROMPT = (diffs: TextDiff[]) => `The text on this image has typos. Fix exactly these words; leave every other pixel of the image unchanged.

${diffs.map(d => `"${d.rendered}" should be "${d.intended}"`).join('\n')}

Do NOT change typography, color, layout, lighting, photography, composition, or any other detail. Only correct the misspelled words listed above. Preserve everything else exactly as it is.`;

/**
 * Step B — call gpt-image-1's images.edit with input_fidelity:'high' to
 * surgically fix only the listed words. Returns the corrected PNG buffer,
 * or null if the edit failed (caller should fall back to the original image).
 */
export async function correctSlideText(
  slidePng: Buffer,
  diffs: TextDiff[],
): Promise<Buffer | null> {
  if (diffs.length === 0) return null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required for text-correction edit');

  const client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS });
  const startTime = Date.now();
  const prompt = EDIT_PROMPT(diffs);

  try {
    const file = await toFile(slidePng, 'slide.png', { type: 'image/png' });
    const response = await client.images.edit({
      model: EDIT_MODEL,
      image: file,
      prompt,
      n: 1,
      size: '1024x1536',
      quality: EDIT_QUALITY,
      input_fidelity: 'high',
    } as Parameters<typeof client.images.edit>[0]) as { data?: Array<{ b64_json?: string }> };

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      console.error('[TextCorrector] images.edit returned empty response');
      return null;
    }

    logAICall({
      provider: 'openai-image',
      model: EDIT_MODEL,
      task: 'correctSlideText',
      inputSummary: summarizeInput(prompt),
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });

    return Buffer.from(b64, 'base64');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[TextCorrector] images.edit failed: ${msg}`);
    return null;
  }
}
