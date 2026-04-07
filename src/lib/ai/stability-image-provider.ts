/**
 * Stability AI Image Generation Provider (SD3 / SDXL)
 *
 * Secondary image provider — replaces DALL-E 3 for better composition fidelity.
 * Stability AI models follow spatial/composition instructions literally,
 * leaving clean negative space where directed.
 *
 * Uses the Stability AI REST API directly (no SDK required).
 *
 * Env vars:
 *   STABILITY_API_KEY — required
 *   STABILITY_MODEL   — optional, defaults to 'sd3.5-large'
 */

import { logAICall, summarizeInput } from './logger';
import type { AICallMeta } from './logger';
import type { AIResult, ImageGenerationOptions } from './types';
import { withRetry, ProviderFailedError } from './retry';

// ─── Configuration ───────────────────────────────────────────────

export interface StabilityImageConfig {
  /** Stability AI API key */
  apiKey: string;
  /** Model to use (default: sd3.5-large) */
  model?: string;
}

// ─── Provider ────────────────────────────────────────────────────

/** Per-request timeout (ms). */
const REQUEST_TIMEOUT_MS = 120_000;

/** API base URL */
const API_BASE = 'https://api.stability.ai';

export class StabilityImageProvider {
  private config: StabilityImageConfig;
  private model: string;

  constructor(config: StabilityImageConfig) {
    if (!config.apiKey) {
      throw new Error(
        'Stability AI API key is required. Set STABILITY_API_KEY environment variable.'
      );
    }

    this.config = config;
    this.model = config.model ?? 'sd3.5-large';
  }

  resolveModel(_slideRole?: string): string {
    return this.model;
  }

  /**
   * Generate an image from a text prompt using Stability AI.
   * Accepts the same 5-layer prompt as Gemini — no simplification.
   *
   * SD3 excels at:
   *   - Following spatial composition instructions literally
   *   - Clean negative space when directed
   *   - Photorealistic output
   *   - Precise subject placement
   */
  async generateImage(
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<AIResult<Buffer>> {
    const startTime = Date.now();

    console.log(`[Stability] Model: ${this.model} (role: ${options?.slideRole ?? 'unset'})`);

    // Split the prompt at NEGATIVE PROMPT if present
    const { positivePrompt, negativePrompt } = this.splitPrompt(prompt);
    const aspectRatio = this.resolveAspectRatio(options?.width, options?.height);

    const imageBuffer = await this.withRetryWrapped(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        // Build multipart form data
        const formData = new FormData();
        formData.append('prompt', positivePrompt);
        if (negativePrompt) {
          formData.append('negative_prompt', negativePrompt);
        }
        formData.append('aspect_ratio', aspectRatio);
        formData.append('output_format', 'png');
        formData.append('model', this.model);

        let response: Response;
        try {
          response = await fetch(`${API_BASE}/v2beta/stable-image/generate/sd3`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`,
              'Accept': 'application/json',
            },
            body: formData,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        if (!response.ok) {
          const errorText = await response.text();
          const err = new Error(
            `Stability API error (HTTP ${response.status}): ${errorText.slice(0, 300)}`
          );
          (err as any).status = response.status;
          throw err;
        }

        const data = await response.json();

        // Stability API returns { image: "<base64>", finish_reason: "SUCCESS", seed: ... }
        const base64 = data.image;
        if (!base64) {
          throw new Error(
            `Stability API returned no image data: ${JSON.stringify(Object.keys(data))}`
          );
        }

        console.log(`[Stability] Image received: ${Math.round(base64.length * 0.75 / 1024)}KB`);
        return Buffer.from(base64, 'base64');
      },
      { task: 'generateImage', prompt: positivePrompt, model: this.model }
    );

    const meta: AICallMeta = {
      provider: 'stability',
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
   * Split a 5-layer prompt into positive and negative components.
   * The 5-layer format includes "NEGATIVE PROMPT:" as the last layer.
   */
  private splitPrompt(prompt: string): { positivePrompt: string; negativePrompt: string } {
    const negIdx = prompt.indexOf('NEGATIVE PROMPT:');
    if (negIdx === -1) {
      return { positivePrompt: prompt.trim(), negativePrompt: '' };
    }

    const positivePrompt = prompt.slice(0, negIdx).trim();
    const negativePrompt = prompt.slice(negIdx + 'NEGATIVE PROMPT:'.length).trim();
    return { positivePrompt, negativePrompt };
  }

  /**
   * Map requested dimensions to Stability AI aspect ratio.
   * Supports: 16:9, 1:1, 21:9, 2:3, 3:2, 4:5, 5:4, 9:16, 9:21
   */
  private resolveAspectRatio(width?: number, height?: number): string {
    if (!width || !height) return '3:4'; // Default: portrait (closest to carousel 4:5)
    const ratio = width / height;
    if (ratio > 1.5) return '16:9';
    if (ratio > 1.1) return '3:2';
    if (ratio > 0.9) return '1:1';
    if (ratio > 0.7) return '4:5';
    if (ratio > 0.6) return '2:3';
    return '9:16';
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
        provider: `Stability/${context.model}`,
      });
      return result.data;
    } catch (err) {
      if (err instanceof ProviderFailedError) {
        throw new ProviderFailedError({
          message: `[stability/${context.model}] ${context.task} FAILED_PROVIDER — ${err.message} | input: "${summarizeInput(context.prompt)}"`,
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
 * Create a StabilityImageProvider from environment variables.
 */
export function createStabilityImageProvider(): StabilityImageProvider {
  return new StabilityImageProvider({
    apiKey: process.env.STABILITY_API_KEY ?? '',
    model: process.env.STABILITY_MODEL,
  });
}
