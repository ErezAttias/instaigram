import type { AIProvider } from './types';
import { MockAIProvider } from './mock-provider';
import { AnthropicProvider } from './anthropic-provider';
import { logProviderInit } from './logger';

let _cachedProvider: AIProvider | null = null;

/**
 * Returns the active AI provider.
 *
 * Default: Anthropic (Claude Sonnet) — the only LLM used by InstAIgram.
 * Set AI_PROVIDER=mock to force mock mode for development.
 */
export function getAIProvider(): AIProvider {
  if (_cachedProvider) return _cachedProvider;

  const providerName = process.env.AI_PROVIDER === 'mock' ? 'mock' : 'anthropic';

  let provider: AIProvider;

  switch (providerName) {
    case 'anthropic': {
      provider = new AnthropicProvider({
        provider: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: process.env.AI_MODEL ?? 'claude-sonnet-4-5',
        temperature: 0.7,
        maxTokens: 4096,
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
