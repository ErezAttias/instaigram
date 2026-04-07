/**
 * OpenAI Image Generation Provider (DALL-E 3)
 *
 * Secondary image provider for fallback when Gemini is unavailable.
 * Uses the exact same prompt — no simplification or style degradation.
 *
 * Env vars:
 *   OPENAI_API_KEY     — required
 *   OPENAI_BASE_URL    — optional API base URL override
 */

import OpenAI from 'openai';
import { logAICall, summarizeInput } from './logger';
import type { AICallMeta } from './logger';
import type { AIResult, ImageGenerationOptions } from './types';
import { withRetry, ProviderFailedError } from './retry';

// ─── Configuration ───────────────────────────────────────────────

export interface OpenAIImageConfig {
  /** OpenAI API key */
  apiKey: string;
  /** API base URL override */
  baseUrl?: string;
}

// ─── Provider ────────────────────────────────────────────────────

/** Per-request timeout for OpenAI image API calls (ms). */
const REQUEST_TIMEOUT_MS = 120_000;

export class OpenAIImageProvider {
  private client: OpenAI;
  private config: OpenAIImageConfig;

  constructor(config: OpenAIImageConfig) {
    if (!config.apiKey) {
      throw new Error(
        'OpenAI API key is required for image generation. Set OPENAI_API_KEY environment variable.'
      );
    }

    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl && { baseURL: config.baseUrl }),
      timeout: REQUEST_TIMEOUT_MS,
    });
  }

  /**
   * Generate an image from a text prompt using DALL-E 3.
   * Accepts the same 5-layer prompt as Gemini — no simplification.
   */
  async generateImage(
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<AIResult<Buffer>> {
    const startTime = Date.now();
    const model = 'dall-e-3';

    console.log(`[OpenAI-Image] Model: ${model} (role: ${options?.slideRole ?? 'unset'})`);

    const imageBuffer = await this.withRetryWrapped(
      async () => {
        const size = this.resolveSize(options?.width, options?.height);
        const quality = options?.quality === 'hd' ? 'hd' : 'standard';

        const response = await this.client.images.generate({
          model,
          prompt,
          n: 1,
          size,
          quality,
          response_format: 'b64_json',
        });

        const imageData = response.data;
        if (!imageData || imageData.length === 0) {
          throw new Error('OpenAI DALL-E returned empty response');
        }
        const b64 = imageData[0].b64_json;
        if (!b64) {
          throw new Error('OpenAI DALL-E returned empty image data');
        }

        console.log(`[OpenAI-Image] Image received: ${Math.round(b64.length * 0.75 / 1024)}KB`);
        return Buffer.from(b64, 'base64');
      },
      { task: 'generateImage', prompt, model }
    );

    const meta: AICallMeta = {
      provider: 'openai-image',
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
   * Map requested dimensions to DALL-E 3 size string.
   * DALL-E 3 supports: 1024x1024, 1024x1792, 1792x1024
   */
  private resolveSize(width?: number, height?: number): '1024x1024' | '1024x1792' | '1792x1024' {
    if (!width || !height) return '1024x1792'; // Default: portrait (carousel)
    const ratio = width / height;
    if (ratio > 1.2) return '1792x1024'; // Landscape
    if (ratio < 0.8) return '1024x1792'; // Portrait
    return '1024x1024'; // Square-ish
  }

  /**
   * Retry wrapper using shared retry utility.
   */
  private async withRetryWrapped<T>(
    operation: () => Promise<T>,
    context: { task: string; prompt: string; model: string }
  ): Promise<T> {
    try {
      const result = await withRetry(operation, {
        task: context.task,
        provider: `OpenAI-Image/${context.model}`,
      });
      return result.data;
    } catch (err) {
      if (err instanceof ProviderFailedError) {
        throw new ProviderFailedError({
          message: `[openai-image/${context.model}] ${context.task} FAILED_PROVIDER — ${err.message} | input: "${summarizeInput(context.prompt)}"`,
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
 * Create an OpenAIImageProvider from environment variables.
 */
export function createOpenAIImageProvider(): OpenAIImageProvider {
  return new OpenAIImageProvider({
    apiKey: process.env.OPENAI_API_KEY ?? '',
    baseUrl: process.env.OPENAI_BASE_URL,
  });
}
