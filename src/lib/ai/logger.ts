/**
 * Structured logging for all AI calls.
 * Every call logs provider, model, task, and input summary.
 */

export interface AICallMeta {
  provider: string;
  model: string;
  task: string;
  inputSummary: string;
  durationMs: number;
  timestamp: string;
  /** Source URL (Wikipedia/Wikimedia) — set by WikipediaImageProvider */
  sourceUrl?: string;
}

const SEPARATOR = '─'.repeat(60);

/**
 * Infer the task name from the prompt content.
 */
export function inferTaskName(prompt: string): string {
  const lower = prompt.toLowerCase();

  // Check for regeneration patterns first (most specific)
  if (lower.includes('slide needs to be rewritten') || lower.includes('one slide needs to')) return 'regenerateSlide';
  if (lower.includes('post needs to be regenerated')) return 'regeneratePost';
  if (lower.includes('hook needs to be replaced')) return 'regenerateHook';

  // Channel names
  if (lower.includes('channel name suggestions') || lower.includes('brand naming specialist')) return 'generateChannelNames';

  // Niche sub-types
  if (lower.includes('existing options to avoid') && lower.includes('intent:')) return 'regenerateMoreNiches';
  if (lower.includes('sharp content angles within broad topic')) return 'generateNiches:explore';
  if (lower.includes('sharpening content positioning') || lower.includes('sharper angles or positioning variants')) return 'generateNiches:direct';

  // TASK line detection
  const taskMatch = lower.match(/task:\s*([^\n]+)/);
  if (taskMatch) {
    const taskLine = taskMatch[1];
    if (taskLine.includes('niche')) return 'generateNiches:discover';
    if (taskLine.includes('hook') || taskLine.includes('30 hooks')) return 'generateHooks';
    if (taskLine.includes('caption')) return 'generateCaption';
    if (taskLine.includes('post') || taskLine.includes('carousel') || taskLine.includes('slide')) return 'generatePost';
  }

  // Fallback role hints
  const firstLine = lower.split('\n')[0];
  if (firstLine.includes('hook writer')) return 'generateHook';
  if (firstLine.includes('niche')) return 'generateNiches';
  if (firstLine.includes('caption writer')) return 'generateCaption';
  if (firstLine.includes('carousel') || firstLine.includes('slide writer')) return 'generatePost';

  return 'unknown';
}

/**
 * Create a short summary of the prompt input (first 120 chars, single line).
 */
export function summarizeInput(prompt: string): string {
  const firstLine = prompt.split('\n').find((l) => l.trim().length > 0) ?? '';
  const trimmed = firstLine.trim();
  return trimmed.length > 120 ? trimmed.slice(0, 117) + '...' : trimmed;
}

/**
 * Log an AI call with full transparency.
 */
export function logAICall(meta: AICallMeta): void {
  const isMock = meta.provider === 'mock';

  console.log(`\n${SEPARATOR}`);
  if (isMock) {
    console.log('⚠️  MOCK PROVIDER ACTIVE — no real AI calls are being made');
  }
  console.log(`[AI Call] ${meta.task}`);
  console.log(`  provider : ${meta.provider}`);
  console.log(`  model    : ${meta.model}`);
  console.log(`  input    : ${meta.inputSummary}`);
  console.log(`  duration : ${meta.durationMs}ms`);
  console.log(`  time     : ${meta.timestamp}`);
  console.log(SEPARATOR);
}

/**
 * Log provider initialization at startup.
 */
export function logProviderInit(provider: string, model: string): void {
  console.log(`\n${SEPARATOR}`);
  if (provider === 'mock') {
    console.log('⚠️  MOCK PROVIDER ACTIVE');
    console.log('   Set AI_PROVIDER=openai and provide OPENAI_API_KEY to use real AI.');
  }
  console.log(`[AI Provider] Initialized`);
  console.log(`  provider : ${provider}`);
  console.log(`  model    : ${model}`);
  console.log(SEPARATOR);
}
