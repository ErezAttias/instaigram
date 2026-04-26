/**
 * Style Bible — Sonnet-generated visual design spec for a baked-text carousel.
 *
 * One bible per CarouselJob. Pinned for the lifetime of the job so every slide
 * shares the same palette, typography, composition rules, and mood. Fed into
 * the per-slide prompt for `gpt-image-1` (see `baked-prompt-builder.ts`).
 *
 * Why Sonnet (not GPT) for this: same provider already authors slide copy,
 * same `generateObject` plumbing, strict-JSON output via Zod. Adding a second
 * provider just for the style spec isn't worth the integration cost.
 */

import { z } from 'zod';
import { getAIProvider } from './provider';
import type { CompressedSlideDisplay } from '@/lib/validation/schemas';

// ─── Schema ──────────────────────────────────────────────────────

// Palette accepts any color string Sonnet returns — hex (`#FF0033`),
// short hex (`#FAA`), or even a named/CSS color (`ivory`). gpt-image-1
// understands all of them in the prompt; we don't need to render them in
// the browser.
//
// Schema is intentionally permissive: any non-empty string passes, and
// every field is optional so a missing/empty key in Sonnet's output
// doesn't fail the whole call. The downstream prompt builder skips
// missing fields gracefully.
// Accept anything Sonnet hands back — including empty strings. The prompt
// builder treats falsy values as "skip this line", so an empty palette.text
// just drops one line from the brief instead of failing the whole job.
const looseStr = z.string().optional();

export const StyleBibleSchema = z.object({
  visualLanguage: looseStr,
  palette: z.object({
    primary: looseStr,
    secondary: looseStr,
    accent: looseStr,
    text: looseStr,
    background: looseStr,
  }).optional(),
  typography: z.object({
    headlineDescription: looseStr,
    bodyDescription: looseStr,
  }).optional(),
  composition: looseStr,
  mood: looseStr,
  motifs: z.array(z.string()).max(10).optional(),
  textPlacement: looseStr,
  doNot: z.array(z.string()).max(15).optional(),
});

export type StyleBible = z.infer<typeof StyleBibleSchema>;

// ─── Generator ───────────────────────────────────────────────────

/**
 * Build a single, internally-consistent visual design spec for a 6-slide
 * carousel. Sonnet picks ONE cohesive look and locks it in — the per-slide
 * prompt later inflates this into a full image-generation brief.
 */
export async function generateStyleBible(
  topic: string,
  slides: Pick<CompressedSlideDisplay, 'slideNumber' | 'displayTitle'>[],
): Promise<StyleBible> {
  const titles = slides
    .map(s => `${s.slideNumber + 1}. ${s.displayTitle}`)
    .join('\n');

  const prompt = `You are an art director designing a 6-slide Instagram carousel that will be rendered with text baked directly into each image by an image model.

Topic: "${topic}"

Slide titles:
${titles}

Pick ONE cohesive visual design language for the entire carousel. Each slide will feature a different real-world subject (a person, object, or scene) drawn from its title — so the design language must be one that supports rich photographic or illustrated SUBJECT IMAGERY on every slide, not just decorative graphic patterns. Slide 1 will be used as a style reference for the rest.

**Bias strongly toward EDITORIAL / PHOTOGRAPHIC looks** rather than pure graphic-design illustration. Examples of the kind of direction we want:
- "Cinematic editorial photography with deep shadow play and 35mm film grain"
- "High-contrast magazine portraiture, hand-drawn caption typography"
- "Documentary-style realism with warm natural light and textured paper overlays"
- "Painterly oil-portrait illustration with bold display type"

Avoid directions like "vinyl-record halftone graphic-design" or "all-typography poster" that would push every slide to the same decorative motif and squeeze out subject imagery.

Rules:
- Pick exactly ONE visual language. Not "minimal AND maximal" — pick a side.
- The visual language MUST allow for a different photographic/illustrated subject on every slide. Each slide will feature a specific person, object, or scene.
- Avoid naming specific brands ("like Apple", "like Vogue") — describe the look in your own words.
- Palette: 5 hex codes that genuinely work together. Background should pair well with text. Avoid pure black or pure white unless the look truly demands it.
- Typography: describe the *style* of type (weight, case, tracking, contrast) — never name a specific font like "Helvetica" or "Inter".
- Composition: one sentence on how a typical slide is laid out (where the subject image sits vs the text). Make sure the subject image is given real estate — not just a small icon corner.
- Motifs: 1–5 SUBTLE recurring visual elements (textures, paper grain, framing devices) that anchor continuity across slides — these should NOT be central scene objects (don't say "vinyl record" or "microphone" — those would dominate every slide).
- Text placement: where headline and supporting text sit on each slide, and how they sit alongside the subject imagery.
- Do-not list: 1–8 things the image model must avoid. Always include: "no all-typography slides without subject imagery", "no decorative motif as the primary visual focus".

Return JSON matching this shape exactly: { visualLanguage, palette: {primary, secondary, accent, text, background}, typography: {headlineDescription, bodyDescription}, composition, mood, motifs, textPlacement, doNot }.`;

  const ai = getAIProvider();
  const { data } = await ai.generateObject(prompt, StyleBibleSchema);

  console.log(
    `[generateStyleBible] visualLanguage="${data.visualLanguage ?? '?'}" palette=${data.palette?.primary ?? '?'}/${data.palette?.background ?? '?'} mood="${data.mood ?? '?'}"`,
  );

  return data;
}
