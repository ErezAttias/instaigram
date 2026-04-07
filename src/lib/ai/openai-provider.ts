import OpenAI from 'openai';
import type { z } from 'zod';
import type { AIProvider, AIProviderConfig, AIResult } from './types';
import { logAICall, inferTaskName, summarizeInput } from './logger';
import { normalizeEnums } from './normalize';
import { withRetry, ProviderFailedError } from './retry';

/**
 * OpenAI-backed AI provider.
 *
 * Uses gpt-4o by default for high-quality structured writing.
 * All calls use JSON mode (response_format: json_object) for structured outputs.
 * Includes retry with exponential backoff for rate limits.
 */
export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private config: AIProviderConfig;
  readonly providerName: string;
  readonly modelName: string;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.providerName = config.provider;
    this.modelName = config.model ?? 'gpt-4o';

    if (!config.apiKey) {
      throw new Error(
        'OpenAI API key is required. Set OPENAI_API_KEY environment variable.'
      );
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl && { baseURL: config.baseUrl }),
    });
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

  /**
   * Retry wrapper using shared retry utility.
   * Handles 429, 500, 502, 503, 529 with 1s → 3s → 7s backoff + ±20% jitter.
   */
  private async withRetryWrapped<T>(
    operation: () => Promise<T>,
    context: { task: string; prompt: string }
  ): Promise<T> {
    try {
      const result = await withRetry(operation, {
        task: context.task,
        provider: `OpenAI/${this.modelName}`,
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

  async generateObject<T>(
    prompt: string,
    schema: z.ZodSchema<T>
  ): Promise<AIResult<T>> {
    const startTime = Date.now();
    const task = inferTaskName(prompt);

    const raw = await this.withRetryWrapped(
      async () => {
        const response = await this.client.chat.completions.create({
          model: this.modelName,
          messages: [
            {
              role: 'system',
              content:
                'You are a content strategy AI for Instagram creators. Respond ONLY with valid JSON — no markdown fences, no commentary, no explanation outside the JSON object. Your output must be a single JSON object that matches the schema described in the user prompt.',
            },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          temperature: this.config.temperature ?? 0.7,
          max_tokens: this.config.maxTokens ?? 4096,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('OpenAI returned empty response content');
        }
        return content;
      },
      { task, prompt }
    );

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const meta = this.buildMeta(prompt, startTime);
      throw new Error(
        `[${this.providerName}/${this.modelName}] ${task} returned invalid JSON — ${raw.slice(0, 200)} | meta: ${JSON.stringify(meta)}`
      );
    }

    // Normalize enum values (fix casing, underscores, etc.) before validation
    parsed = normalizeEnums(parsed);

    // Validate against the Zod schema
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
        const response = await this.client.chat.completions.create({
          model: this.modelName,
          messages: [
            {
              role: 'system',
              content:
                'You are a content strategy AI for Instagram creators. Provide clear, actionable, high-quality writing.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: this.config.temperature ?? 0.7,
          max_tokens: this.config.maxTokens ?? 4096,
        });

        const text = response.choices[0]?.message?.content;
        if (!text) {
          throw new Error('OpenAI returned empty response content');
        }
        return text;
      },
      { task, prompt }
    );

    const meta = this.buildMeta(prompt, startTime);
    return { data: content, meta };
  }

}
