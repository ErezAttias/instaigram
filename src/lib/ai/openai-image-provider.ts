/**
 * OpenAI Image Generation Provider (gpt-image-1)
 *
 * Uses OpenAI's gpt-image-1 model, which has stronger prompt adherence than
 * Gemini — in particular it reliably honors negative instructions like
 * "no text, no frames, no white bars".
 *
 * Env vars:
 *   OPENAI_API_KEY             — required
 *   OPENAI_BASE_URL            — optional API base URL override
 *   OPENAI_IMAGE_MODEL         — optional model override (default: gpt-image-1)
 *   OPENAI_IMAGE_QUALITY       — 'low' | 'medium' | 'high' | 'auto' (default: medium)
 */

import OpenAI from 'openai';
import { logAICall, summarizeInput } from './logger';
import type { AICallMeta } from './logger';
import type { AIResult, ImageGenerationOptions, RawImageProvider } from './types';
import { withRetry, ProviderFailedError } from './retry';

// ─── Configuration ───────────────────────────────────────────────

export type OpenAIImageQuality = 'low' | 'medium' | 'high' | 'auto';

export interface OpenAIImageConfig {
  apiKey: string;
  baseUrl?: string;
  /** Model override (default: gpt-image-1) */
  model?: string;
  /** Quality tier (default: medium — matches Gemini cost, ~$0.04/image) */
  quality?: OpenAIImageQuality;
}

const DEFAULT_MODEL = 'gpt-image-1';
const DEFAULT_QUALITY: OpenAIImageQuality = 'medium';
const REQUEST_TIMEOUT_MS = 180_000;

type GptImageSize = '1024x1024' | '1024x1536' | '1536x1024' | 'auto';

// ─── Provider ────────────────────────────────────────────────────

export class OpenAIImageProvider implements RawImageProvider {
  private client: OpenAI;
  private model: string;
  private quality: OpenAIImageQuality;

  constructor(config: OpenAIImageConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required. Set OPENAI_API_KEY.');
    }

    this.model = config.model ?? DEFAULT_MODEL;
    this.quality = config.quality ?? DEFAULT_QUALITY;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl && { baseURL: config.baseUrl }),
      timeout: REQUEST_TIMEOUT_MS,
    });
  }

  resolveModel(_slideRole?: string): string {
    return this.model;
  }

  async generateImage(
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<AIResult<Buffer>> {
    const startTime = Date.now();
    const size = this.resolveSize(options?.width, options?.height);

    console.log(`[OpenAI-Image] Model: ${this.model} quality: ${this.quality} size: ${size} (role: ${options?.slideRole ?? 'unset'})`);

    const imageBuffer = await this.withRetryWrapped(
      async () => {
        const response = await this.client.images.generate({
          model: this.model,
          prompt,
          n: 1,
          size,
          quality: this.quality,
        });

        const imageData = response.data;
        if (!imageData || imageData.length === 0) {
          throw new Error(`${this.model} returned empty response`);
        }
        const b64 = imageData[0].b64_json;
        if (!b64) {
          throw new Error(`${this.model} returned empty image data`);
        }

        console.log(`[OpenAI-Image] Image received: ${Math.round(b64.length * 0.75 / 1024)}KB`);
        return Buffer.from(b64, 'base64');
      },
      { task: 'generateImage', prompt, model: this.model }
    );

    const meta: AICallMeta = {
      provider: 'openai-image',
      model: this.model,
      task: 'generateImage',
      inputSummary: summarizeInput(prompt),
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
    logAICall(meta);

    return { data: imageBuffer, meta };
  }

  /**
   * Map requested dimensions to gpt-image-1 size.
   * Supported: 1024x1024, 1024x1536, 1536x1024, auto.
   */
  private resolveSize(width?: number, height?: number): GptImageSize {
    if (!width || !height) return '1024x1536';
    const ratio = width / height;
    if (ratio > 1.2) return '1536x1024';
    if (ratio < 0.8) return '1024x1536';
    return '1024x1024';
  }

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

export function createOpenAIImageProvider(): OpenAIImageProvider {
  const qualityEnv = (process.env.OPENAI_IMAGE_QUALITY ?? '').toLowerCase();
  const quality: OpenAIImageQuality =
    qualityEnv === 'low' || qualityEnv === 'medium' || qualityEnv === 'high' || qualityEnv === 'auto'
      ? qualityEnv
      : DEFAULT_QUALITY;

  return new OpenAIImageProvider({
    apiKey: process.env.OPENAI_API_KEY ?? '',
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_IMAGE_MODEL,
    quality,
  });
}
