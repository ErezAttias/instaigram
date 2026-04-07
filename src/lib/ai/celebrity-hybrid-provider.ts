/**
 * Celebrity Hybrid Image Provider
 *
 * Routes image generation based on slide role:
 *   - OPENER / CTA  → WikipediaImageProvider (real celebrity photo)
 *   - FACT / other  → scene provider (xAI Aurora for contextual AI scenes)
 *
 * This gives celebrity carousels a credible, recognizable face on the OPENER
 * slide while keeping AI generation for contextual fact illustrations.
 */

import type { AIResult, ImageGenerationOptions, RawImageProvider } from './types';
import type { WikipediaImageProvider } from './wikipedia-image-provider';

// OPENER/HOOK and CTA both use Wikipedia (real photos, different images each).
const PORTRAIT_ROLES = new Set(['OPENER', 'HOOK', 'CTA']);

export class CelebrityHybridProvider implements RawImageProvider {
  constructor(
    private portraitProvider: WikipediaImageProvider,
    private sceneProvider: RawImageProvider
  ) {}

  async generateImage(
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<AIResult<Buffer>> {
    const role = options?.slideRole;
    if (role && PORTRAIT_ROLES.has(role)) {
      return this.portraitProvider.generateImage(prompt, options);
    }
    return this.sceneProvider.generateImage(prompt, options);
  }

  resolveModel(slideRole?: string): string {
    if (slideRole && PORTRAIT_ROLES.has(slideRole)) {
      return this.portraitProvider.resolveModel(slideRole);
    }
    return this.sceneProvider.resolveModel(slideRole);
  }
}
