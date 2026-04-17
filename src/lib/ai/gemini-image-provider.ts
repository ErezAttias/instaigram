/**
 * Gemini Image Generation Provider
 *
 * Uses Google Gemini image generation models via the REST API.
 * Routes to different models based on slide role:
 *   - OPENER / CTA  → gemini-3-pro-image-preview   (highest quality)
 *   - FACT / IMPLICATION → gemini-3.1-flash-image-preview (fast, cost-efficient)
 *
 * Model can be overridden via env vars:
 *   GEMINI_IMAGE_MODEL_PRO   — override the "pro" model
 *   GEMINI_IMAGE_MODEL_FLASH — override the "flash" model
 *   GEMINI_IMAGE_MODEL       — force a single model for all roles
 */

import { logAICall, summarizeInput } from './logger';
import type { AICallMeta } from './logger';
import type { AIResult, ImageGenerationOptions } from './types';
import { withRetry, ProviderFailedError } from './retry';

// ─── Gemini API Types ────────────────────────────────────────────

interface GeminiRequestBody {
  contents: Array<{
    parts: Array<{ text: string }>;
  }>;
  generationConfig: {
    responseModalities: string[];
    imageConfig?: {
      aspectRatio?: string;
      imageSize?: string;
    };
  };
}

interface GeminiResponsePart {
  text?: string;
  /** snake_case variant (some API versions) */
  inline_data?: {
    mime_type: string;
    data: string;
  };
  /** camelCase variant (current API response format) */
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: GeminiResponsePart[];
    };
    finishReason?: string;
  }>;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

// ─── Model Routing ───────────────────────────────────────────────

/** Default model assignments by slide role tier.
 * NOTE: gemini-3.x-image-preview models are currently returning HTTP 500.
 * Using gemini-2.5-flash-image for all roles until 3.x stabilizes. */
const DEFAULT_MODEL_PRO = 'gemini-2.5-flash-image';
const DEFAULT_MODEL_FLASH = 'gemini-2.5-flash-image';

/** Roles that get the pro model (high-impact, first/last impression slides) */
const PRO_ROLES = new Set(['HOOK', 'OPENER', 'CTA']);

/** Roles that get the flash model (information-dense, mid-carousel slides) */
const FLASH_ROLES = new Set(['FACT', 'IMPLICATION', 'BUILD', 'SETUP', 'INSIGHT']);

// ─── Configuration ───────────────────────────────────────────────

export interface GeminiImageConfig {
  /** Google AI API key */
  apiKey: string;
  /** Override pro model for all OPENER/CTA slides */
  modelPro?: string;
  /** Override flash model for all FACT/IMPLICATION slides */
  modelFlash?: string;
  /** Force a single model for ALL slide roles (overrides pro/flash) */
  modelOverride?: string;
  /** API base URL override (for proxies or regional endpoints) */
  baseUrl?: string;
}

// ─── Provider ────────────────────────────────────────────────────

// Retry config is now in shared retry.ts (1s → 3s → 7s + jitter, retryable: 429/500/502/503/529)

/** Per-request timeout for Gemini API calls (ms).
 * Set to 30s so that when Gemini is down, retries complete in ~134s total,
 * leaving room for the secondary provider within the 180s per-slide budget. */
const REQUEST_TIMEOUT_MS = 30_000; // 30 seconds per request

export class GeminiImageProvider {
  private config: GeminiImageConfig;
  private modelPro: string;
  private modelFlash: string;
  private baseUrl: string;

  constructor(config: GeminiImageConfig) {
    if (!config.apiKey) {
      throw new Error(
        'Gemini API key is required. Set GEMINI_API_KEY environment variable.'
      );
    }

    this.config = config;
    this.modelPro = config.modelOverride ?? config.modelPro ?? DEFAULT_MODEL_PRO;
    this.modelFlash = config.modelOverride ?? config.modelFlash ?? DEFAULT_MODEL_FLASH;
    this.baseUrl = config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  /**
   * Resolve which model to use based on slide role.
   */
  resolveModel(slideRole?: string): string {
    if (this.config.modelOverride) return this.config.modelOverride;

    const role = (slideRole ?? '').toUpperCase();
    if (PRO_ROLES.has(role)) return this.modelPro;
    if (FLASH_ROLES.has(role)) return this.modelFlash;

    // Default to flash for unknown roles (cheaper, faster)
    return this.modelFlash;
  }

  /**
   * Generate an image from a text prompt using Gemini.
   *
   * Fallback chain: if the role-appropriate model (pro for OPENER/CTA,
   * flash for FACT/IMPLICATION) fails after retries, and it was the pro
   * model, we try flash once before giving up. That turns "OPENER/CTA
   * render as a pure gradient because pro timed out" into "OPENER/CTA
   * render with the flash model instead", which is what users expect.
   */
  async generateImage(
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<AIResult<Buffer>> {
    const primaryModel = this.resolveModel(options?.slideRole);
    try {
      return await this.generateWithModel(prompt, primaryModel, options);
    } catch (err) {
      const isProviderFail = err instanceof ProviderFailedError;
      const proFailed = primaryModel === this.modelPro;
      const flashAvailable = this.modelFlash && this.modelFlash !== primaryModel;
      if (isProviderFail && proFailed && flashAvailable) {
        console.warn(
          `[Gemini] Pro model ${primaryModel} failed — falling back to ${this.modelFlash} so OPENER/CTA slides still get imagery.`
        );
        return await this.generateWithModel(prompt, this.modelFlash, options);
      }
      throw err;
    }
  }

  /** Internal: one attempt at a specific model (with the usual retry loop). */
  private async generateWithModel(
    prompt: string,
    model: string,
    options?: ImageGenerationOptions,
  ): Promise<AIResult<Buffer>> {
    const startTime = Date.now();
    const aspectRatio = this.resolveAspectRatio(options?.width, options?.height);

    console.log(`[Gemini] Model: ${model} (role: ${options?.slideRole ?? 'unset'})`);

    const body: GeminiRequestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio,
          imageSize: '1K',
        },
      },
    };

    const url = `${this.baseUrl}/models/${model}:generateContent`;

    const imageBuffer = await this.withRetryWrapped(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        let response: Response;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': this.config.apiKey,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        if (!response.ok) {
          const errorText = await response.text();
          const err = new Error(
            `Gemini API error (HTTP ${response.status}): ${errorText.slice(0, 300)}`
          );
          (err as any).status = response.status;
          throw err;
        }

        const data: GeminiResponse = await response.json();

        // Check for API-level error
        if (data.error) {
          throw new Error(
            `Gemini API error (${data.error.status}): ${data.error.message}`
          );
        }

        // Extract image from response parts
        const candidate = data.candidates?.[0];
        const parts = candidate?.content?.parts;
        if (!parts || parts.length === 0) {
          const finishReason = candidate?.finishReason ?? 'unknown';
          console.error(`[Gemini] Empty response. finishReason: ${finishReason}`);
          console.error(`[Gemini] Raw response keys: ${JSON.stringify(Object.keys(data))}`);
          // NO_IMAGE is intermittent — mark as retryable (status 500)
          const err = new Error(`Gemini returned empty response (finishReason: ${finishReason})`);
          (err as any).status = 500;
          throw err;
        }

        // Log part types for debugging
        const partTypes = parts.map(p =>
          (p.inline_data || p.inlineData) ? 'image' : p.text ? 'text' : 'unknown'
        );
        console.log(`[Gemini] Response parts: ${partTypes.join(', ')} (finishReason: ${candidate?.finishReason})`);

        // Extract image — handle both camelCase and snake_case response formats
        for (const part of parts) {
          const imageData = part.inlineData ?? part.inline_data;
          if (imageData) {
            const base64 = imageData.data;
            const mimeType = ('mimeType' in imageData ? imageData.mimeType : imageData.mime_type) ?? 'image/png';
            console.log(`[Gemini] Image received: ${mimeType}, ${Math.round(base64.length * 0.75 / 1024)}KB`);
            return Buffer.from(base64, 'base64');
          }
        }

        // Log text content if only text was returned
        const textParts = parts.filter(p => p.text).map(p => p.text!.slice(0, 200));
        throw new Error(
          `Gemini response contained no image data — only text parts returned: ${textParts.join(' | ')}`
        );
      },
      { task: 'generateImage', prompt, model }
    );

    const meta: AICallMeta = {
      provider: 'gemini',
      model,
      task: 'generateImage',
      inputSummary: summarizeInput(prompt),
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
    logAICall(meta);

    return { data: imageBuffer, meta };
  }

  /**
   * Map requested dimensions to Gemini aspect ratio string.
   * Gemini supports: 1:1, 3:4, 4:3, 9:16, 16:9
   */
  private resolveAspectRatio(width?: number, height?: number): string {
    if (!width || !height) return '3:4'; // Default: portrait (closest to 4:5 carousel)
    const ratio = width / height;
    if (ratio > 1.5) return '16:9';
    if (ratio > 1.1) return '4:3';
    if (ratio > 0.9) return '1:1';
    if (ratio > 0.65) return '3:4';
    return '9:16';
  }

  /**
   * Retry wrapper using shared retry utility.
   * Handles 429, 500, 502, 503, 529 with 1s → 3s → 7s backoff + ±20% jitter.
   */
  private async withRetryWrapped<T>(
    operation: () => Promise<T>,
    context: { task: string; prompt: string; model: string }
  ): Promise<T> {
    try {
      const result = await withRetry(operation, {
        task: context.task,
        provider: `Gemini/${context.model}`,
      });
      return result.data;
    } catch (err) {
      if (err instanceof ProviderFailedError) {
        throw new ProviderFailedError({
          message: `[gemini/${context.model}] ${context.task} FAILED_PROVIDER — ${err.message} | input: "${summarizeInput(context.prompt)}"`,
          httpStatus: err.httpStatus,
          attempts: err.attempts,
          provider: err.provider,
          task: err.task,
          cause: err.cause instanceof Error ? err.cause : undefined,
        });
      }
      throw err;
    }
  }
}

// ─── Factory ─────────────────────────────────────────────────────

/**
 * Create a GeminiImageProvider from environment variables.
 *
 * Env vars:
 *   GEMINI_API_KEY           — required
 *   GEMINI_IMAGE_MODEL       — force single model for all roles
 *   GEMINI_IMAGE_MODEL_PRO   — override pro model (OPENER/CTA)
 *   GEMINI_IMAGE_MODEL_FLASH — override flash model (FACT/IMPLICATION)
 *   GEMINI_BASE_URL          — API base URL override
 */
export function createGeminiImageProvider(): GeminiImageProvider {
  return new GeminiImageProvider({
    apiKey: process.env.GEMINI_API_KEY ?? '',
    modelOverride: process.env.GEMINI_IMAGE_MODEL,
    modelPro: process.env.GEMINI_IMAGE_MODEL_PRO,
    modelFlash: process.env.GEMINI_IMAGE_MODEL_FLASH,
    baseUrl: process.env.GEMINI_BASE_URL,
  });
}
