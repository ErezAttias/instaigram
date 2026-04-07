import type { z } from 'zod';
import type { AICallMeta } from './logger';

/**
 * Result wrapper that includes the generated data plus call metadata.
 */
export interface AIResult<T> {
  data: T;
  meta: AICallMeta;
}

/**
 * Abstract interface for AI providers (OpenAI, Anthropic, mock, etc.).
 * All AI interactions in the app go through this interface.
 *
 * Every method returns an AIResult with full call metadata for transparency.
 */
export interface AIProvider {
  /** Provider identifier (e.g., 'mock', 'openai') */
  readonly providerName: string;
  /** Model identifier (e.g., 'mock', 'gpt-4o') */
  readonly modelName: string;

  /**
   * Generate a structured object matching the given Zod schema.
   * The provider is responsible for ensuring the output conforms to the schema.
   */
  generateObject<T>(prompt: string, schema: z.ZodSchema<T>): Promise<AIResult<T>>;

  /**
   * Generate free-form text from a prompt.
   */
  generateText(prompt: string): Promise<AIResult<string>>;

  /**
   * Generate an image from a text prompt.
   * Returns the image as a Buffer (PNG).
   * Optional — providers that don't support image generation should return undefined.
   */
  generateImage?(prompt: string, options?: ImageGenerationOptions): Promise<AIResult<Buffer>>;
}

/**
 * Minimal interface for any image-generating provider.
 * Implemented by GeminiImageProvider, StabilityImageProvider, FalImageProvider.
 */
export interface RawImageProvider {
  generateImage(prompt: string, options?: ImageGenerationOptions): Promise<AIResult<Buffer>>;
  resolveModel(slideRole?: string): string;
}

/**
 * Options for image generation.
 */
export interface ImageGenerationOptions {
  /** Image dimensions */
  width?: number;
  height?: number;
  /** Quality level */
  quality?: 'standard' | 'hd';
  /** Style preference */
  style?: 'natural' | 'vivid';
  /** Slide role — used by providers that route to different models per role */
  slideRole?: string;
  /** Subject name (e.g. celebrity's real name) — used by Wikipedia provider for accurate lookup */
  subjectName?: string;
  /** URLs already used by other slides — Wikipedia provider will skip these to avoid duplicates */
  excludeUrls?: string[];
}

/**
 * Configuration for an AI provider instance.
 */
export interface AIProviderConfig {
  /** Provider identifier (e.g., 'openai', 'anthropic', 'mock') */
  provider: string;
  /** API key for the provider */
  apiKey?: string;
  /** Model identifier (e.g., 'gpt-4o', 'claude-sonnet-4-20250514') */
  model?: string;
  /** Maximum tokens for generation */
  maxTokens?: number;
  /** Temperature for generation (0-2) */
  temperature?: number;
  /** Base URL override for API calls */
  baseUrl?: string;
}
