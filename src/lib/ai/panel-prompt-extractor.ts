/**
 * Panel-prompt extractor.
 *
 * Takes the Phase-1 design board (one image with 6 cinematic panels) and
 * asks Claude vision to write a DETAILED STRUCTURED PROMPT for each panel —
 * the kind of prompt a designer would hand to gpt-image-1 to recreate the
 * panel exactly (LAYOUT, TOP ELEMENTS, HEADLINE, BODY TEXT, RIGHT-SIDE
 * VISUAL, TYPOGRAPHY RULES, COLOR SYSTEM, CONSISTENCY blocks).
 *
 * These prompts then feed `images.generate` (not `images.edit`) for Phase 2,
 * which preserves typography fidelity far better than passing a small
 * reference panel — because the model gets explicit type/layout/color
 * directives instead of having to reverse-engineer them from blurry pixels.
 *
 * The intended text for each slide is passed in alongside the board so
 * Claude bakes the *correct* spelling into its extracted prompts, even if
 * the board image itself has typos.
 */

import { logAICall, summarizeInput } from './logger';

const VISION_MODEL = process.env.ANTHROPIC_VISION_MODEL ?? 'claude-sonnet-4-5';
const REQUEST_TIMEOUT_MS = 90_000;

export interface PanelTextContent {
  headline: string;
  body?: string;
  swipeCta?: string;
}

const PANEL_POSITIONS = [
  'top-left', 'top-right',
  'middle-left', 'middle-right',
  'bottom-left', 'bottom-right',
] as const;

function buildExtractionPrompt(panels: PanelTextContent[]): string {
  // Pass the headline text as-is. We used to pre-uppercase to combat one
  // specific failure mode (slide 6 drifting to Title Case on uppercase-style
  // boards), but that override BROKE the more important rule: match what
  // the board actually chose. If the board renders Title Case, slides
  // should render Title Case too. Claude's job below is to inspect each
  // panel and match the case it sees.
  const panelBlocks = panels.map((p, i) => {
    const lines = [`PANEL ${i + 1} (${PANEL_POSITIONS[i] ?? `panel ${i + 1}`}):`];
    lines.push(`  Headline: ${p.headline}`);
    if (p.body) lines.push(`  Body: ${p.body}`);
    if (p.swipeCta) lines.push(`  Swipe CTA: ${p.swipeCta}`);
    return lines.join('\n');
  }).join('\n\n');

  return `You are a design analyst. The supplied image is a 1024×1536 design board showing 6 Instagram carousel slides arranged 2 columns × 3 rows.

For each of the 6 panels, write a DETAILED STRUCTURED PROMPT that would recreate the panel as a single full-size 1024×1536 Instagram slide using a text-to-image model.

For each panel, include these blocks (use exactly these headers, in this order):

PANEL <n> PROMPT:
Create a 1024x1536 vertical Instagram carousel slide.

STYLE:
<photographic mood, lighting, environment — concrete, declarative>

LAYOUT (CRITICAL):
<spatial layout in concrete terms — e.g. "Left 40% text column, right 60% subject photo"; positions of every element>

TOP ELEMENTS:
<any badges, labels, pagination indicators with their position, color, shape>

HEADLINE:
<the literal headline text — write it in the EXACT case the panel renders it. If the panel's typography is UPPERCASE, write the headline in ALL CAPS. If it's Title Case, write it in Title Case. Match the case the panel actually uses.>
<typography description: weight, case (UPPERCASE/Title/lowercase), serif vs sans, condensed/extended, color>

BODY TEXT:
<the literal body text — same rule: write it in the case it should be rendered>
<typography description>

HIGHLIGHTS:
<any words shown in an accent color — list them and the color>

VISUAL ELEMENTS:
<photographic subject, position, lighting; any overlay graphics, arrows, icons, callouts>

TYPOGRAPHY RULES:
<spelling fidelity, no distortion, no decorative texture on letters — short imperative bullets>

COLOR SYSTEM:
<background, text, accent — name colors and hex if you can read them>

CONSISTENCY:
<one short sentence — e.g. "Premium fitness infographic slide aesthetic">

────────────────────────────

Rules:
- Use the INTENDED text content I'm providing below, NOT what is rendered on the panel image. If the panel has a typo, the extracted prompt must use the corrected spelling.
- Be concrete and declarative. Avoid flowery prose.
- One prompt per panel, in numerical order (Panel 1 first, Panel 6 last).
- Separate the 6 prompts with this exact divider line: \`---PANEL---\`
- Output nothing else outside the panel prompts (no preamble, no commentary).

Intended text content for each panel (use these exact words):

${panelBlocks}`;
}

/**
 * One Claude vision call that returns 6 structured prompts, one per panel.
 * Throws on transport failure; returns an array of 6 prompt strings on
 * success (caller falls back to undefined-per-panel if the array is wrong
 * length).
 */
export async function extractPanelPrompts(
  boardPng: Buffer,
  panels: PanelTextContent[],
): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required for panel-prompt extraction');
  if (panels.length !== 6) throw new Error(`Expected 6 panels, got ${panels.length}`);

  const startTime = Date.now();
  const base64 = boardPng.toString('base64');
  const prompt = buildExtractionPrompt(panels);

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
        max_tokens: 6000,
        temperature: 0.2,
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
    throw new Error(`Anthropic vision call failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json() as { content?: Array<{ type: string; text?: string }> };
  const textBlock = data.content?.find(b => b.type === 'text');
  const raw = (textBlock?.text ?? '').trim();

  // Split on the divider Claude was instructed to use.
  const parts = raw.split(/^\s*---PANEL---\s*$/m).map(p => p.trim()).filter(Boolean);

  logAICall({
    provider: 'anthropic-vision',
    model: VISION_MODEL,
    task: 'extractPanelPrompts',
    inputSummary: summarizeInput(prompt),
    durationMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  });

  console.log(`[PanelPrompts] extracted ${parts.length}/6 prompts (avg ${Math.round(parts.reduce((a, b) => a + b.length, 0) / Math.max(parts.length, 1))}c each)`);

  return parts;
}
