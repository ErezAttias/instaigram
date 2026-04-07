/**
 * fal.ai Image Generation Provider (Flux 1.1 Pro)
 *
 * Primary provider for celebrity / public-figure topics.
 * Flux 1.1 Pro produces the best photorealistic faces and respects
 * real-person prompts — unlike Gemini which blocks celebrity likenesses.
 *
 * Uses the fal.ai REST API directly (no SDK required).
 *
 * Env vars:
 *   FAL_API_KEY — required for celebrity carousels
 */

import { logAICall, summarizeInput } from './logger';
import type { AICallMeta } from './logger';
import type { AIResult, ImageGenerationOptions, RawImageProvider } from './types';
import { withRetry, ProviderFailedError } from './retry';

// ─── Configuration ───────────────────────────────────────────────

export interface FalImageConfig {
  apiKey: string;
  model?: string;
}

// ─── Provider ────────────────────────────────────────────────────

const DEFAULT_MODEL = 'fal-ai/flux-pro/v1.1';
const API_BASE = 'https://fal.run';
const REQUEST_TIMEOUT_MS = 60_000;

export class FalImageProvider implements RawImageProvider {
  private config: FalImageConfig;
  private model: string;

  constructor(config: FalImageConfig) {
    if (!config.apiKey) {
      throw new Error(
        'fal.ai API key is required. Set FAL_API_KEY environment variable.'
      );
    }
    this.config = config;
    this.model = config.model ?? DEFAULT_MODEL;
  }

  resolveModel(_slideRole?: string): string {
    return this.model;
  }

  async generateImage(
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<AIResult<Buffer>> {
    const startTime = Date.now();

    console.log(`[Fal] Model: ${this.model} (role: ${options?.slideRole ?? 'unset'})`);

    const imageBuffer = await this.withRetryWrapped(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        let response: Response;
        try {
          response = await fetch(`${API_BASE}/${this.model}`, {
            method: 'POST',
            headers: {
              'Authorization': `Key ${this.config.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              prompt,
              image_size: 'portrait_4_3',
              num_images: 1,
              output_format: 'jpeg',
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        if (!response.ok) {
          const errorText = await response.text();
          const err = new Error(
            `fal.ai API error (HTTP ${response.status}): ${errorText.slice(0, 300)}`
          );
          (err as any).status = response.status;
          throw err;
        }

        const data = await response.json();

        // fal.ai returns { images: [{ url, content_type, ... }], ... }
        const imageUrl: string | undefined = data?.images?.[0]?.url;
        if (!imageUrl) {
          throw new Error(
            `fal.ai returned no image URL: ${JSON.stringify(Object.keys(data))}`
          );
        }

        // Fetch the image bytes from the returned URL
        const imgResponse = await fetch(imageUrl);
        if (!imgResponse.ok) {
          throw new Error(`fal.ai image fetch failed (HTTP ${imgResponse.status})`);
        }
        const arrayBuffer = await imgResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        console.log(`[Fal] Image received: ${Math.round(buffer.length / 1024)}KB`);
        return buffer;
      },
      { task: 'generateImage', prompt, model: this.model }
    );

    const meta: AICallMeta = {
      provider: 'fal',
      model: this.model,
      task: 'generateImage',
      inputSummary: summarizeInput(prompt),
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
    logAICall(meta);

    return { data: imageBuffer, meta };
  }

  private async withRetryWrapped<T>(
    operation: () => Promise<T>,
    context: { task: string; prompt: string; model: string }
  ): Promise<T> {
    try {
      const result = await withRetry(operation, {
        task: context.task,
        provider: `Fal/${context.model}`,
      });
      return result.data;
    } catch (err) {
      if (err instanceof ProviderFailedError) {
        throw new ProviderFailedError({
          message: `[fal/${context.model}] ${context.task} FAILED_PROVIDER — ${err.message} | input: "${summarizeInput(context.prompt)}"`,
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

export function createFalImageProvider(): FalImageProvider {
  return new FalImageProvider({
    apiKey: process.env.FAL_API_KEY ?? '',
    model: process.env.FAL_IMAGE_MODEL,
  });
}
