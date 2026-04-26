/**
 * Pass-through "compress" step.
 *
 * Originally an LLM rewrite that shortened headline/body into displayTitle/
 * displaySupport for rendering. The rewrite was the source of unnatural-sounding
 * copy (it stripped voice and rhythm to hit char caps). The upstream generator
 * (`generate-simple.ts`) now produces display-ready copy directly within the
 * 55/180 char caps, so this step is a synchronous projection: clamp + brand-
 * fill the CTA + thread the OPENER swipeCta through.
 *
 * Public signature is preserved so existing call sites (gates, regeneration,
 * standalone-carousel-service) keep working.
 */

import type { AIProvider } from '@/lib/ai/types';
import type { GeneratedSlideV2 } from '@/lib/validation/schemas';

export interface CompressedSlideDisplay {
  slideNumber: number;
  displayTitle: string;
  displaySupport: string;
  /** OPENER only: contextual swipe CTA. */
  swipeCta?: string;
  /** Reserved for compatibility with old call sites that read this field. */
  microStoryWarning?: string;
}

export interface CompressResult {
  compressed: CompressedSlideDisplay[];
}

const HARD_TITLE_LIMIT = 55;
const HARD_SUPPORT_LIMIT = 180;
const HARD_CTA_LIMIT = 40;

function clamp(s: string, max: number): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

/**
 * Project slides into renderer-ready display fields. No LLM call.
 *
 * - displayTitle = clamped headline
 * - displaySupport = clamped body (FACT/IMPLICATION) or empty (OPENER/CTA)
 * - swipeCta = passed through from the slide (OPENER only)
 * - CTA slides get hardcoded brand text
 */
export async function compressSlides(
  params: { topic: string; slides: GeneratedSlideV2[]; angleDescription?: string; layout?: 'DETAILED' | 'BOLD' },
  _ai: AIProvider,
): Promise<CompressResult> {
  const compressed: CompressedSlideDisplay[] = params.slides.map((s) => {
    if (s.role === 'CTA') {
      return {
        slideNumber: s.slideNumber,
        displayTitle: 'We post only interesting facts!',
        displaySupport: 'Follow us to get fresh facts everyday',
      };
    }
    const isOpener = s.role === 'OPENER';
    const entry: CompressedSlideDisplay = {
      slideNumber: s.slideNumber,
      displayTitle: clamp(s.headline, HARD_TITLE_LIMIT),
      displaySupport: isOpener ? '' : clamp(s.body, HARD_SUPPORT_LIMIT),
    };
    if (isOpener && s.swipeCta && s.swipeCta.trim()) {
      entry.swipeCta = clamp(s.swipeCta.trim(), HARD_CTA_LIMIT);
    }
    return entry;
  });

  return { compressed };
}
