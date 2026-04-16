/**
 * Re-export stub.
 *
 * The old 9-step pipeline has been replaced by a single one-shot call to
 * Claude Sonnet 4.5 (`generate-simple.ts`). This file exists only to keep
 * existing imports working; once all callers are updated in phase 2, delete it.
 */

export { generateCarousel } from './generate-simple';
export type { PipelineParams, PipelineResult, CarouselValidationReport } from './generate-simple';
