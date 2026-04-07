/**
 * xAI Image Generation Provider (grok-2-image / Aurora)
 *
 * Primary provider for celebrity / public-figure topics.
 * Aurora explicitly generates celebrity likenesses with high photorealism —
 * a deliberate design choice by xAI, unlike Gemini/OpenAI which block real people.
 *
 * Uses the xAI REST API (OpenAI-compatible).
 *
 * Env vars:
 *   XAI_API_KEY — required for celebrity carousels
 */

import { logAICall, summarizeInput } from './logger';
import type { AICallMeta } from './logger';
import type { AIResult, ImageGenerationOptions, RawImageProvider } from './types';
import { withRetry, ProviderFailedError } from './retry';

// ─── Configuration ───────────────────────────────────────────────

export interface XAIImageConfig {
  apiKey: string;
  model?: string;
}

// ─── Provider ────────────────────────────────────────────────────

const DEFAULT_MODEL = 'grok-imagine-image-pro';
const API_BASE = 'https://api.x.ai/v1';
const REQUEST_TIMEOUT_MS = 60_000;

export class XAIImageProvider implements RawImageProvider {
  private config: XAIImageConfig;
  private model: string;

  constructor(config: XAIImageConfig) {
    if (!config.apiKey) {
      throw new Error(
        'xAI API key is required. Set XAI_API_KEY environment variable.'
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

    console.log(`[xAI] Model: ${this.model} (role: ${options?.slideRole ?? 'unset'})`);

    const imageBuffer = await this.withRetryWrapped(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        let response: Response;
        try {
          response = await fetch(`${API_BASE}/images/generations`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: this.model,
              prompt,
              n: 1,
              response_format: 'b64_json',
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        if (!response.ok) {
          const errorText = await response.text();
          const err = new Error(
            `xAI API error (HTTP ${response.status}): ${errorText.slice(0, 300)}`
          );
          (err as any).status = response.status;
          throw err;
        }

        const data = await response.json();

        // xAI returns OpenAI-compatible: { data: [{ b64_json, ... }] }
        const b64: string | undefined = data?.data?.[0]?.b64_json;
        if (!b64) {
          throw new Error(
            `xAI returned no image data: ${JSON.stringify(Object.keys(data))}`
          );
        }

        const buffer = Buffer.from(b64, 'base64');
        console.log(`[xAI] Image received: ${Math.round(buffer.length / 1024)}KB`);
        return buffer;
      },
      { task: 'generateImage', prompt, model: this.model }
    );

    const meta: AICallMeta = {
      provider: 'xai',
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
        provider: `xAI/${context.model}`,
      });
      return result.data;
    } catch (err) {
      if (err instanceof ProviderFailedError) {
        throw new ProviderFailedError({
          message: `[xai/${context.model}] ${context.task} FAILED_PROVIDER — ${err.message} | input: "${summarizeInput(context.prompt)}"`,
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

export function createXAIImageProvider(): XAIImageProvider {
  return new XAIImageProvider({
    apiKey: process.env.XAI_API_KEY ?? '',
    model: process.env.XAI_IMAGE_MODEL,
  });
}
