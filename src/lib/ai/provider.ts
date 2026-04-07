import type { AIProvider } from './types';
import { MockAIProvider } from './mock-provider';
import { OpenAIProvider } from './openai-provider';
import { logProviderInit } from './logger';

/**
 * Global config flag — when true, mock provider is used regardless of AI_PROVIDER env var.
 * Set USE_MOCK_PROVIDER=true in .env to force mock mode.
 * Defaults to true when AI_PROVIDER is unset (safe default).
 */
function isMockForced(): boolean {
  const explicit = process.env.USE_MOCK_PROVIDER;
  if (explicit !== undefined) {
    return explicit === 'true' || explicit === '1';
  }
  // Default: mock is forced when no AI_PROVIDER is set
  return !process.env.AI_PROVIDER || process.env.AI_PROVIDER === 'mock';
}

let _cachedProvider: AIProvider | null = null;

/**
 * Returns the active AI provider based on environment configuration.
 *
 * Resolution order:
 * 1. If USE_MOCK_PROVIDER=true → always mock (with loud warning)
 * 2. AI_PROVIDER env var → 'mock' | 'openai'
 * 3. Default → mock (with loud warning)
 *
 * Usage:
 *   const ai = getAIProvider();
 *   const { data, meta } = await ai.generateObject(prompt, NicheSchema);
 */
export function getAIProvider(): AIProvider {
  if (_cachedProvider) return _cachedProvider;

  const mockForced = isMockForced();
  const providerName = mockForced ? 'mock' : (process.env.AI_PROVIDER ?? 'mock');

  let provider: AIProvider;

  switch (providerName) {
    case 'openai': {
      provider = new OpenAIProvider({
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.AI_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o',
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE ?? '0.7'),
        maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS ?? '4096', 10),
        baseUrl: process.env.OPENAI_BASE_URL,
      });
      break;
    }

    case 'mock':
    default:
      provider = new MockAIProvider();
      break;
  }

  logProviderInit(provider.providerName, provider.modelName);
  _cachedProvider = provider;
  return provider;
}

/**
 * Reset cached provider (useful for testing).
 */
export function resetAIProvider(): void {
  _cachedProvider = null;
}
