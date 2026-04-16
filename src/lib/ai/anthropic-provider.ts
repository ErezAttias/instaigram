import type { z } from 'zod';
import type { AIProvider, AIProviderConfig, AIResult } from './types';
import { logAICall, inferTaskName, summarizeInput } from './logger';
import { normalizeEnums } from './normalize';
import { withRetry, ProviderFailedError } from './retry';

/**
 * Anthropic-backed AI provider using Claude Sonnet.
 * Uses the Anthropic Messages API directly (no SDK needed).
 */
export class AnthropicProvider implements AIProvider {
  private apiKey: string;
  private config: AIProviderConfig;
  readonly providerName: string;
  readonly modelName: string;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.providerName = config.provider;
    this.modelName = config.model ?? 'claude-sonnet-4-5';

    const key = config.apiKey || process.env.ANTHROPIC_API_KEY || getAnthropicKeyFromEnvFile();
    if (!key) {
      throw new Error('Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable.');
    }
    this.apiKey = key;
  }

  private buildMeta(prompt: string, startTime: number) {
    const meta = {
      provider: this.providerName,
      model: this.modelName,
      task: inferTaskName(prompt),
      inputSummary: summarizeInput(prompt),
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
    logAICall(meta);
    return meta;
  }

  private async withRetryWrapped<T>(
    operation: () => Promise<T>,
    context: { task: string; prompt: string }
  ): Promise<T> {
    try {
      const result = await withRetry(operation, {
        task: context.task,
        provider: `Anthropic/${this.modelName}`,
      });
      return result.data;
    } catch (err) {
      if (err instanceof ProviderFailedError) {
        const inputSummary = summarizeInput(context.prompt);
        throw new Error(
          `[${this.providerName}/${this.modelName}] ${context.task} FAILED_PROVIDER — ${err.message} | input: "${inputSummary}"`
        );
      }
      throw err;
    }
  }

  private async callMessages(systemPrompt: string, userPrompt: string): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.modelName,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: this.config.temperature ?? 0.7,
        max_tokens: this.config.maxTokens ?? 4096,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      const status = res.status;
      // Map Anthropic errors to retryable status codes
      if (status === 429 || status === 500 || status === 502 || status === 503 || status === 529) {
        const err = new Error(`Anthropic ${status}: ${body.slice(0, 200)}`);
        (err as { status?: number }).status = status;
        throw err;
      }
      throw new Error(`Anthropic ${status}: ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const block = data.content?.find?.((b: { type: string }) => b.type === 'text');
    const text = block?.text;
    if (!text) {
      throw new Error(`Anthropic returned no text block: ${JSON.stringify(data).slice(0, 300)}`);
    }
    return text;
  }

  async generateObject<T>(
    prompt: string,
    schema: z.ZodSchema<T>
  ): Promise<AIResult<T>> {
    const startTime = Date.now();
    const task = inferTaskName(prompt);

    const raw = await this.withRetryWrapped(
      async () => {
        return this.callMessages(
          'You are a content strategy AI for Instagram creators. Respond ONLY with valid JSON — no markdown fences, no commentary, no explanation outside the JSON object.',
          prompt,
        );
      },
      { task, prompt }
    );

    // Extract JSON from potential markdown fences
    let jsonStr = raw.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      const meta = this.buildMeta(prompt, startTime);
      throw new Error(
        `[${this.providerName}/${this.modelName}] ${task} returned invalid JSON — ${jsonStr.slice(0, 200)} | meta: ${JSON.stringify(meta)}`
      );
    }

    parsed = normalizeEnums(parsed);

    const result = schema.safeParse(parsed);
    if (!result.success) {
      const meta = this.buildMeta(prompt, startTime);
      const issues = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(
        `[${this.providerName}/${this.modelName}] ${task} schema validation failed — ${issues} | raw keys: ${Object.keys(parsed as Record<string, unknown>).join(',')} | meta: ${JSON.stringify(meta)}`
      );
    }

    const meta = this.buildMeta(prompt, startTime);
    return { data: result.data, meta };
  }

  async generateText(prompt: string): Promise<AIResult<string>> {
    const startTime = Date.now();
    const task = inferTaskName(prompt);

    const content = await this.withRetryWrapped(
      async () => {
        return this.callMessages(
          'You are a helpful content assistant. Respond concisely and directly.',
          prompt,
        );
      },
      { task, prompt }
    );

    const meta = this.buildMeta(prompt, startTime);
    return { data: content, meta };
  }
}

/** Fallback: read ANTHROPIC_API_KEY from .env.local when system env is empty. */
let _envFileKey: string | undefined;
function getAnthropicKeyFromEnvFile(): string | undefined {
  if (_envFileKey !== undefined) return _envFileKey || undefined;
  try {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.resolve(process.cwd(), '.env.local');
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    _envFileKey = match?.[1]?.trim() ?? '';
  } catch {
    _envFileKey = '';
  }
  return _envFileKey || undefined;
}
