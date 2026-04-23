/**
 * Unified Image Provider with Deterministic Fallback + Carousel-Level Locking
 *
 * Two-provider image generation system:
 *   PRIMARY:   Gemini (existing)
 *   SECONDARY: Stability AI SD3 (fallback — composition-faithful)
 *
 * Carousel-level provider locking:
 *   - One carousel = one provider. No mixing.
 *   - First slide determines the locked provider.
 *   - If locked provider fails mid-carousel → needsRestart = true.
 *   - Caller restarts full carousel with secondary provider.
 *
 * Fallback triggers (immediate, no retry):
 *   - HTTP 503 (Service Unavailable / capacity)
 *   - AbortError (timeout)
 *   - fetch failed (network)
 *   - FAILED_PROVIDER (all retries exhausted)
 *
 * Rules:
 *   - Same 5-layer prompt for both providers — no simplification
 *   - Sequential fallback only — no parallel race
 *   - Full traceability per slide (imageSource, providerError)
 */

import type { ImageGenerationOptions, RawImageProvider } from './types';
import type { AICallMeta } from './logger';
import { GeminiImageProvider, createGeminiImageProvider } from './gemini-image-provider';
import { StabilityImageProvider, createStabilityImageProvider } from './stability-image-provider';
import { createOpenAIImageProvider } from './openai-image-provider';
import { WikipediaImageProvider } from './wikipedia-image-provider';
import { CelebrityHybridProvider } from './celebrity-hybrid-provider';
import { ProviderFailedError, extractHttpStatus } from './retry';

// ─── Types ───────────────────────────────────────────────────────

/** Which provider generated the image */
export type ImageSourceProvider = 'gemini' | 'stability' | 'fal' | 'openai' | 'fallback';

/** Result from the unified image provider, includes traceability */
export interface ImageGenerationResult {
  /** The generated image buffer */
  data: Buffer;
  /** AI call metadata */
  meta: AICallMeta;
  /** Which provider actually generated this image */
  imageSource: ImageSourceProvider;
  /** If fallback was triggered, the error from the primary provider */
  providerError?: string;
  /** HTTP status that triggered fallback (if applicable) */
  providerErrorStatus?: number;
}

/**
 * Common interface for anything that can generate images.
 * Implemented by UnifiedImageProvider and CarouselImageSession.
 * Renderers accept this interface so they work with either.
 */
export interface ImageGenerator {
  generateImage(prompt: string, options?: ImageGenerationOptions): Promise<ImageGenerationResult>;
  resolveModel(slideRole?: string): string;
}

/** Per-slide traceability for carousel summary */
export interface SlideProviderTrace {
  slideIndex: number;
  slideRole: string;
  imageSource: ImageSourceProvider;
  providerError?: string;
  providerErrorStatus?: number;
}

/** Carousel-level provider summary */
export interface CarouselProviderSummary {
  /** Total slides in carousel */
  totalSlides: number;
  /** The provider locked for this carousel */
  lockedProvider: string | null;
  /** How many slides used the fallback provider */
  fallbackCount: number;
  /** Whether the carousel was restarted due to mid-carousel failure */
  wasRestarted: boolean;
  /** Error that triggered restart (if applicable) */
  restartReason?: string;
  /** Per-slide provider trace */
  slides: SlideProviderTrace[];
}

// ─── Fallback Detection ──────────────────────────────────────────

/** HTTP status codes that trigger IMMEDIATE fallback (no retry) */
const CAPACITY_ERROR_CODES = new Set([503]);

/**
 * Check if an error is a capacity error that should trigger immediate fallback.
 * These errors skip retries entirely — the provider is overloaded.
 */
function isCapacityError(err: unknown): boolean {
  const status = extractHttpStatus(err);
  if (status !== undefined && CAPACITY_ERROR_CODES.has(status)) return true;
  return false;
}

/**
 * Check if an error should trigger fallback to secondary provider.
 * Covers: capacity errors, timeouts, network failures, exhausted retries.
 */
export function shouldFallback(err: unknown): boolean {
  // Capacity errors (503) — immediate fallback
  if (isCapacityError(err)) return true;

  // FAILED_PROVIDER — all retries exhausted
  if (err instanceof ProviderFailedError) return true;

  // Timeout (AbortError)
  if (err instanceof Error && err.name === 'AbortError') return true;

  // Network failure
  if (err instanceof Error && err.message.includes('fetch failed')) return true;

  return false;
}

/**
 * Extract a human-readable error summary for traceability.
 */
function summarizeError(err: unknown): string {
  if (err instanceof ProviderFailedError) {
    return `FAILED_PROVIDER (HTTP ${err.httpStatus ?? 'unknown'}, ${err.attempts} attempts): ${err.message.slice(0, 200)}`;
  }
  if (err instanceof Error) {
    const status = extractHttpStatus(err);
    const statusStr = status ? ` (HTTP ${status})` : '';
    return `${err.name}${statusStr}: ${err.message.slice(0, 200)}`;
  }
  return String(err).slice(0, 200);
}

// ─── Unified Provider (per-slide fallback) ───────────────────────

export class UnifiedImageProvider implements ImageGenerator {
  private primary: RawImageProvider;
  private secondary: RawImageProvider | null;
  private primaryName: string;
  private secondaryName: string;

  constructor(
    primary: RawImageProvider,
    secondary: RawImageProvider | null,
    primaryName = 'gemini',
    secondaryName = 'stability',
  ) {
    this.primary = primary;
    this.secondary = secondary;
    this.primaryName = primaryName;
    this.secondaryName = secondaryName;
  }

  /** Expose primary provider for session creation */
  getPrimary(): RawImageProvider { return this.primary; }
  /** Expose secondary provider for session creation */
  getSecondary(): RawImageProvider | null { return this.secondary; }
  /** Expose provider names for logging */
  getPrimaryName(): string { return this.primaryName; }
  getSecondaryName(): string { return this.secondaryName; }

  resolveModel(slideRole?: string): string {
    return this.primary.resolveModel(slideRole);
  }

  /**
   * Generate an image with per-slide deterministic fallback.
   * For carousel-level locking, use CarouselImageSession instead.
   */
  async generateImage(
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<ImageGenerationResult> {
    // ── Attempt 1: Primary provider ──
    try {
      const result = await this.primary.generateImage(prompt, options);
      return {
        data: result.data,
        meta: result.meta,
        imageSource: this.primaryName as ImageSourceProvider,
      };
    } catch (primaryErr) {
      if (!shouldFallback(primaryErr)) {
        throw primaryErr;
      }

      const errorSummary = summarizeError(primaryErr);
      const status = extractHttpStatus(primaryErr)
        ?? (primaryErr instanceof ProviderFailedError ? primaryErr.httpStatus : undefined);

      console.warn(`[UnifiedImage] PRIMARY (${this.primaryName}) failed — triggering fallback`);
      console.warn(`[UnifiedImage] Reason: ${errorSummary}`);

      if (!this.secondary) {
        console.error(`[UnifiedImage] No secondary provider configured — cannot fallback`);
        throw primaryErr;
      }

      try {
        console.log(`[UnifiedImage] Attempting SECONDARY (${this.secondaryName})...`);
        const result = await this.secondary.generateImage(prompt, options);
        console.log(`[UnifiedImage] SECONDARY succeeded`);

        return {
          data: result.data,
          meta: result.meta,
          imageSource: this.secondaryName as ImageSourceProvider,
          providerError: errorSummary,
          providerErrorStatus: status,
        };
      } catch (secondaryErr) {
        console.error(`[UnifiedImage] SECONDARY (${this.secondaryName}) also failed: ${summarizeError(secondaryErr)}`);
        throw secondaryErr;
      }
    }
  }
}

// ─── Carousel Image Session (carousel-level locking) ─────────────

/**
 * Error thrown when the locked provider fails mid-carousel.
 * The caller should check session.needsRestart and call session.resetForRestart().
 */
export class CarouselRestartNeeded extends Error {
  readonly code = 'CAROUSEL_RESTART_NEEDED';
  readonly failedSlideIndex: number;
  readonly failedProvider: 'gemini' | 'stability';
  readonly cause: unknown;

  constructor(opts: {
    failedSlideIndex: number;
    failedProvider: 'gemini' | 'stability';
    cause: unknown;
  }) {
    const msg = `Locked provider "${opts.failedProvider}" failed at slide ${opts.failedSlideIndex} — carousel restart required`;
    super(msg);
    this.name = 'CarouselRestartNeeded';
    this.failedSlideIndex = opts.failedSlideIndex;
    this.failedProvider = opts.failedProvider;
    this.cause = opts.cause;
  }
}

/**
 * Carousel-level image session with provider locking.
 *
 * Rules:
 *   1. Start unlocked — first generateImage() determines provider
 *   2. If primary succeeds on first slide → lock to primary for all slides
 *   3. If primary fails on first slide → lock to secondary for all slides
 *   4. If locked provider fails mid-carousel → set needsRestart = true, throw
 *   5. Caller checks needsRestart, calls resetForRestart(), re-renders all slides
 *
 * Usage:
 *   const session = createCarouselSession(unifiedProvider);
 *   for (const slide of slides) {
 *     try {
 *       const result = await session.generateImage(prompt, options);
 *     } catch (err) {
 *       if (session.needsRestart) break;
 *       throw err;
 *     }
 *   }
 *   if (session.needsRestart) {
 *     session.resetForRestart();
 *     // re-render all slides from scratch
 *   }
 */
export class CarouselImageSession implements ImageGenerator {
  private primary: RawImageProvider;
  private secondary: RawImageProvider | null;
  private primaryName: string;
  private secondaryName: string;
  private _lockedProvider: string | null = null;
  private _needsRestart = false;
  private _wasRestarted = false;
  private _restartReason: string | undefined;
  private _slideIndex = 0;
  private _traces: SlideProviderTrace[] = [];

  constructor(
    primary: RawImageProvider,
    secondary: RawImageProvider | null,
    primaryName = 'gemini',
    secondaryName = 'stability',
  ) {
    this.primary = primary;
    this.secondary = secondary;
    this.primaryName = primaryName;
    this.secondaryName = secondaryName;
  }

  /** Current locked provider (null = not yet determined) */
  get lockedProvider(): string | null {
    return this._lockedProvider;
  }

  /** True if locked provider failed mid-carousel and a restart is needed */
  get needsRestart(): boolean {
    return this._needsRestart;
  }

  /** True if this session was restarted (for summary reporting) */
  get wasRestarted(): boolean {
    return this._wasRestarted;
  }

  /** Per-slide traces collected so far */
  get traces(): readonly SlideProviderTrace[] {
    return this._traces;
  }

  resolveModel(slideRole?: string): string {
    return this.primary.resolveModel(slideRole);
  }

  /**
   * Generate an image respecting the carousel-level provider lock.
   *
   * - If unlocked: tries primary, locks on result
   * - If locked: uses locked provider only
   * - If locked provider fails mid-carousel: sets needsRestart, throws CarouselRestartNeeded
   */
  async generateImage(
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<ImageGenerationResult> {
    const slideIndex = this._slideIndex++;
    const slideRole = options?.slideRole ?? 'UNKNOWN';

    // ── Already locked — use locked provider only ──
    if (this._lockedProvider !== null) {
      return this.generateWithLockedProvider(prompt, options, slideIndex, slideRole);
    }

    // ── Not locked yet (first slide) — determine provider ──
    return this.generateFirstSlide(prompt, options, slideIndex, slideRole);
  }

  /**
   * Reset the session for a full carousel restart with the secondary provider.
   * Clears all traces, resets slide index, locks to secondary.
   */
  resetForRestart(): void {
    if (!this.secondary) {
      throw new Error('[CarouselSession] Cannot restart — no secondary provider configured');
    }

    const previousProvider = this._lockedProvider;
    const reason = this._restartReason;

    this._lockedProvider = this.secondaryName;
    this._needsRestart = false;
    this._wasRestarted = true;
    this._restartReason = reason; // preserve for summary
    this._slideIndex = 0;
    this._traces = [];

    console.log(`[CarouselSession] RESTART — switching from "${previousProvider}" to "${this.secondaryName}"`);
    console.log(`[CarouselSession] Reason: ${reason}`);
    console.log(`[CarouselSession] All previous slides discarded — re-rendering from slide 1`);
  }

  /**
   * Build the carousel provider summary for reporting.
   */
  getSummary(): CarouselProviderSummary {
    return {
      totalSlides: this._traces.length,
      lockedProvider: this._lockedProvider,
      fallbackCount: this._traces.filter(t => t.imageSource !== this.primaryName).length,
      wasRestarted: this._wasRestarted,
      restartReason: this._restartReason,
      slides: [...this._traces],
    };
  }

  // ── Internal: First slide (determines lock) ─────────────────────

  private async generateFirstSlide(
    prompt: string,
    options: ImageGenerationOptions | undefined,
    slideIndex: number,
    slideRole: string,
  ): Promise<ImageGenerationResult> {
    // Try primary first
    try {
      const result = await this.primary.generateImage(prompt, options);
      this._lockedProvider = this.primaryName;
      console.log(`[CarouselSession] Provider LOCKED to "${this.primaryName}" (slide 1 succeeded)`);

      const genResult: ImageGenerationResult = {
        data: result.data,
        meta: result.meta,
        imageSource: this.primaryName as ImageSourceProvider,
      };
      this.recordTrace(slideIndex, slideRole, genResult);
      return genResult;
    } catch (primaryErr) {
      if (!shouldFallback(primaryErr)) {
        throw primaryErr;
      }

      const errorSummary = summarizeError(primaryErr);
      const status = extractHttpStatus(primaryErr)
        ?? (primaryErr instanceof ProviderFailedError ? primaryErr.httpStatus : undefined);

      console.warn(`[CarouselSession] PRIMARY (${this.primaryName}) failed on slide 1 — locking to secondary`);
      console.warn(`[CarouselSession] Reason: ${errorSummary}`);

      // No secondary available
      if (!this.secondary) {
        console.error(`[CarouselSession] No secondary provider — cannot fallback`);
        throw primaryErr;
      }

      // Lock to secondary for entire carousel
      this._lockedProvider = this.secondaryName;
      console.log(`[CarouselSession] Provider LOCKED to "${this.secondaryName}" (slide 1 primary failed)`);

      const result = await this.secondary.generateImage(prompt, options);

      const genResult: ImageGenerationResult = {
        data: result.data,
        meta: result.meta,
        imageSource: this.secondaryName as ImageSourceProvider,
        providerError: errorSummary,
        providerErrorStatus: status,
      };
      this.recordTrace(slideIndex, slideRole, genResult);
      return genResult;
    }
  }

  // ── Internal: Locked provider generation ────────────────────────

  private async generateWithLockedProvider(
    prompt: string,
    options: ImageGenerationOptions | undefined,
    slideIndex: number,
    slideRole: string,
  ): Promise<ImageGenerationResult> {
    const provider = this._lockedProvider === this.primaryName ? this.primary : this.secondary;

    if (!provider) {
      throw new Error(`[CarouselSession] Locked to "${this._lockedProvider}" but provider is null`);
    }

    try {
      const result = await provider.generateImage(prompt, options);

      const genResult: ImageGenerationResult = {
        data: result.data,
        meta: result.meta,
        imageSource: this._lockedProvider as ImageSourceProvider,
      };
      this.recordTrace(slideIndex, slideRole, genResult);
      return genResult;
    } catch (err) {
      if (!shouldFallback(err)) {
        throw err;
      }

      // Locked provider failed mid-carousel — DO NOT switch providers
      const errorSummary = summarizeError(err);
      console.error(`[CarouselSession] LOCKED provider "${this._lockedProvider}" failed at slide ${slideIndex + 1}`);
      console.error(`[CarouselSession] Reason: ${errorSummary}`);
      console.error(`[CarouselSession] Carousel consistency violated — RESTART REQUIRED`);

      this._needsRestart = true;
      this._restartReason = errorSummary;

      throw new CarouselRestartNeeded({
        failedSlideIndex: slideIndex,
        failedProvider: (this._lockedProvider ?? 'gemini') as 'gemini' | 'stability',
        cause: err,
      });
    }
  }

  // ── Internal: Trace recording ───────────────────────────────────

  private recordTrace(
    slideIndex: number,
    slideRole: string,
    result: ImageGenerationResult,
  ): void {
    this._traces.push({
      slideIndex,
      slideRole,
      imageSource: result.imageSource,
      providerError: result.providerError,
      providerErrorStatus: result.providerErrorStatus,
    });
  }
}

// ─── Factory ─────────────────────────────────────────────────────

let _cachedUnifiedProvider: UnifiedImageProvider | null = null;
let _cachedCelebrityProvider: UnifiedImageProvider | null = null;

/**
 * Create the unified image provider from environment variables.
 *
 * Primary: Gemini (requires GEMINI_API_KEY)
 * Secondary: Stability AI SD3 (requires STABILITY_API_KEY, optional)
 *
 * If STABILITY_API_KEY is not set, secondary is null (no fallback available).
 */
export function getUnifiedImageProvider(): UnifiedImageProvider {
  if (_cachedUnifiedProvider) return _cachedUnifiedProvider;

  // IMAGE_PROVIDER=openai routes the primary slot to OpenAI gpt-image-1.
  // Gemini stays as the secondary fallback so a bad API key doesn't brick carousels.
  const useOpenAI = (process.env.IMAGE_PROVIDER ?? '').toLowerCase() === 'openai';

  let primary: RawImageProvider;
  let primaryName: ImageSourceProvider;
  let secondary: RawImageProvider | null = null;
  let secondaryName: ImageSourceProvider = 'stability';

  if (useOpenAI) {
    primary = createOpenAIImageProvider();
    primaryName = 'openai';
    try {
      secondary = createGeminiImageProvider();
      secondaryName = 'gemini';
      console.log(`[UnifiedImage] Initialized: PRIMARY=OpenAI gpt-image-1, SECONDARY=Gemini`);
    } catch (err) {
      console.warn(`[UnifiedImage] Failed to initialize Gemini fallback: ${err instanceof Error ? err.message : err}`);
      console.log(`[UnifiedImage] Initialized: PRIMARY=OpenAI gpt-image-1, SECONDARY=none`);
    }
  } else {
    primary = createGeminiImageProvider();
    primaryName = 'gemini';
    if (process.env.STABILITY_API_KEY) {
      try {
        secondary = createStabilityImageProvider();
        secondaryName = 'stability';
        console.log(`[UnifiedImage] Initialized: PRIMARY=Gemini, SECONDARY=Stability AI SD3`);
      } catch (err) {
        console.warn(`[UnifiedImage] Failed to initialize secondary (Stability): ${err instanceof Error ? err.message : err}`);
        console.log(`[UnifiedImage] Initialized: PRIMARY=Gemini, SECONDARY=none`);
      }
    } else {
      console.log(`[UnifiedImage] Initialized: PRIMARY=Gemini, SECONDARY=none (no STABILITY_API_KEY)`);
    }
  }

  _cachedUnifiedProvider = new UnifiedImageProvider(primary, secondary, primaryName, secondaryName);
  return _cachedUnifiedProvider;
}

/**
 * Create the celebrity image provider: fal.ai Flux 1.1 Pro (primary) + Stability (fallback).
 * Used for carousels about real people / celebrities where Gemini blocks likenesses.
 */
export function getCelebrityImageProvider(): UnifiedImageProvider {
  if (_cachedCelebrityProvider) return _cachedCelebrityProvider;

  // Wikipedia provider (OPENER/CTA) + Gemini (FACT scenes) composed into hybrid
  const wiki = new WikipediaImageProvider();
  const gemini = createGeminiImageProvider();
  const primary: RawImageProvider = new CelebrityHybridProvider(wiki, gemini);

  let secondary: StabilityImageProvider | null = null;
  if (process.env.STABILITY_API_KEY) {
    try {
      secondary = createStabilityImageProvider();
      console.log(`[UnifiedImage] Celebrity provider initialized: PRIMARY=Wikipedia+Gemini hybrid, SECONDARY=Stability AI SD3`);
    } catch (err) {
      console.warn(`[UnifiedImage] Failed to initialize secondary (Stability): ${err instanceof Error ? err.message : err}`);
      console.log(`[UnifiedImage] Celebrity provider initialized: PRIMARY=Wikipedia+Gemini hybrid, SECONDARY=none`);
    }
  } else {
    console.log(`[UnifiedImage] Celebrity provider initialized: PRIMARY=Wikipedia+Gemini hybrid, SECONDARY=none (no STABILITY_API_KEY)`);
  }

  _cachedCelebrityProvider = new UnifiedImageProvider(primary, secondary, 'gemini', 'stability');
  return _cachedCelebrityProvider;
}

/**
 * Get the appropriate image provider for a given topic and optional direction.
 * Celebrity topics use fal.ai Flux; all others use Gemini.
 */
export function getImageProviderForTopic(topic?: string, direction?: string | null): UnifiedImageProvider {
  if (topic && isCelebrityTopic(topic, direction)) {
    return getCelebrityImageProvider();
  }
  return getUnifiedImageProvider();
}

/**
 * Detect if a topic is about a celebrity / public figure.
 * Used to route to the fal.ai Flux provider which handles real-person likeness.
 *
 * Two-signal detection:
 *   1. Topic contains a known celebrity role keyword (singer, actor, etc.)
 *   2. Topic looks like a person's name (short, capitalised, no fact-domain match)
 *      AND direction contains a personal pronoun (him/her/his/she/he)
 */
export function isCelebrityTopic(topic: string, direction?: string | null): boolean {
  const lower = topic.toLowerCase();

  // Signal 1: explicit celebrity role keyword in topic
  const CELEBRITY_KEYWORDS = [
    'singer', 'musician', 'rapper', 'artist', 'actor', 'actress',
    'celebrity', 'performer', 'band', 'athlete', 'footballer', 'player',
    'director', 'filmmaker', 'composer', 'songwriter', 'producer',
    'comedian', 'entertainer', 'influencer', 'youtuber', 'streamer',
    'pop star', 'rock star', 'music facts', 'music artist',
  ];
  if (CELEBRITY_KEYWORDS.some(kw => lower.includes(kw))) return true;

  // Signal 2: topic looks like a real-world entity (person, band, group, organization)
  // Criteria: short (≤ 30 chars), starts with uppercase, not a known fact/science domain.
  // Pronoun match in direction is a confirming bonus but not required — bands like "Oasis"
  // won't have "he/she" but are still real Wikipedia entities.
  const FACT_DOMAIN_WORDS = /\b(animal|wildlife|science|shark|whale|ocean|history|mythology|tech|ai|brain|health|space|planet)\b/i;
  const isEntityLike =
    topic.trim().length <= 30 &&
    /^[A-Z]/.test(topic.trim()) &&
    !FACT_DOMAIN_WORDS.test(topic);

  if (isEntityLike) return true;

  return false;
}

/**
 * Reset cached providers (for testing).
 */
export function resetUnifiedImageProvider(): void {
  _cachedUnifiedProvider = null;
  _cachedCelebrityProvider = null;
}

/**
 * Create a new carousel image session from the unified provider.
 * Each carousel render should get its own session.
 */
export function createCarouselSession(unified: UnifiedImageProvider): CarouselImageSession {
  return new CarouselImageSession(
    unified.getPrimary(),
    unified.getSecondary(),
    unified.getPrimaryName(),
    unified.getSecondaryName(),
  );
}

// ─── Carousel Summary Helper ─────────────────────────────────────

/**
 * Build a carousel-level provider summary from per-slide traces.
 */
export function buildCarouselProviderSummary(
  traces: SlideProviderTrace[],
  primaryName = 'gemini',
): CarouselProviderSummary {
  return {
    totalSlides: traces.length,
    lockedProvider: null,
    fallbackCount: traces.filter(t => t.imageSource !== primaryName).length,
    wasRestarted: false,
    slides: traces,
  };
}
