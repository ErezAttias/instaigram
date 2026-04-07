/**
 * Shared retry utility for external API calls.
 *
 * Handles transient failures (rate limits, overload, server errors)
 * with fixed backoff schedule + jitter.
 *
 * Backoff schedule: 1s → 3s → 7s (with ±20% jitter)
 * Retryable: 429 (rate limit), 500, 502, 503, 529 (overloaded)
 */

// ─── Configuration ───────────────────────────────────────────────

/** Fixed backoff delays in milliseconds for each retry attempt */
const BACKOFF_SCHEDULE_MS = [1000, 3000, 7000];

/** Maximum number of retry attempts */
export const MAX_RETRIES = 3;

/** Jitter factor: ±20% of the base delay */
const JITTER_FACTOR = 0.2;

/** HTTP status codes that are safe to retry */
export const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 529]);

/**
 * HTTP status codes that indicate provider capacity exhaustion.
 * These trigger IMMEDIATE fallback — retries are skipped because the
 * provider is overloaded, not experiencing a transient glitch.
 */
export const CAPACITY_ERROR_CODES = new Set([503]);

// ─── Types ───────────────────────────────────────────────────────

export interface RetryContext {
  /** Human-readable label for logging (e.g. "generateObject", "generateImage") */
  task: string;
  /** Provider name for log prefix (e.g. "OpenAI", "Gemini") */
  provider: string;
}

export interface RetryResult<T> {
  data: T;
  /** Number of retries that were attempted (0 = first try succeeded) */
  attempts: number;
}

/** Marker error class for provider-level failures after all retries exhausted */
export class ProviderFailedError extends Error {
  readonly code = 'FAILED_PROVIDER';
  readonly httpStatus?: number;
  readonly attempts: number;
  readonly provider: string;
  readonly task: string;

  constructor(opts: {
    message: string;
    httpStatus?: number;
    attempts: number;
    provider: string;
    task: string;
    cause?: Error;
  }) {
    super(opts.message);
    this.name = 'ProviderFailedError';
    this.httpStatus = opts.httpStatus;
    this.attempts = opts.attempts;
    this.provider = opts.provider;
    this.task = opts.task;
    if (opts.cause) this.cause = opts.cause;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Apply ±20% jitter to a base delay to avoid synchronized retries.
 */
function applyJitter(baseMs: number): number {
  const jitter = baseMs * JITTER_FACTOR * (2 * Math.random() - 1);
  return Math.max(0, Math.round(baseMs + jitter));
}

/**
 * Extract HTTP status from various error shapes.
 * Works with OpenAI SDK errors (.status), fetch errors (.status), and
 * errors with status embedded in the message.
 */
export function extractHttpStatus(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const s = (err as { status: unknown }).status;
    if (typeof s === 'number') return s;
  }
  return undefined;
}

/**
 * Check whether an error is a capacity error (503) that should NOT be retried.
 * These indicate provider overload — retrying wastes time.
 * The caller should fall back to a secondary provider immediately.
 */
export function isCapacityError(err: unknown): boolean {
  const status = extractHttpStatus(err);
  return status !== undefined && CAPACITY_ERROR_CODES.has(status);
}

/**
 * Check whether an error is retryable based on its HTTP status code or type.
 * Abort errors (timeouts) and fetch failures are also retryable.
 *
 * IMPORTANT: Capacity errors (503) are excluded from retries when
 * `skipCapacityRetries` is true (default). This enables fast fallback
 * to a secondary provider instead of wasting time retrying an overloaded one.
 */
export function isRetryableError(err: unknown, skipCapacityRetries = true): boolean {
  // Capacity errors: skip retries if configured (let caller fall back)
  if (skipCapacityRetries && isCapacityError(err)) return false;

  const status = extractHttpStatus(err);
  if (status !== undefined && RETRYABLE_STATUS_CODES.has(status)) return true;

  // AbortError (request timeout) is NOT retryable — it indicates the provider
  // is slow/overloaded. Let it bubble up immediately for fast fallback to
  // the secondary provider instead of wasting 3 more 30s attempts.
  if (err instanceof Error && err.name === 'AbortError') return false;

  // Network failures are retryable (transient connectivity issues)
  if (err instanceof Error) {
    if (err.message.includes('fetch failed')) return true;
  }
  return false;
}

// ─── Core Retry Function ─────────────────────────────────────────

/**
 * Execute an async operation with retry + exponential backoff + jitter.
 *
 * Backoff schedule: 1s → 3s → 7s (±20% jitter)
 * Retryable status codes: 429, 500, 502, 503, 529
 *
 * On final failure, throws ProviderFailedError with code FAILED_PROVIDER.
 *
 * @example
 * ```ts
 * const result = await withRetry(
 *   () => fetch(url),
 *   { task: 'generateImage', provider: 'Gemini' }
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  context: RetryContext & { skipCapacityRetries?: boolean },
): Promise<RetryResult<T>> {
  const skipCapacity = context.skipCapacityRetries ?? true;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const data = await operation();
      return { data, attempts: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const status = extractHttpStatus(err);
      const retryable = isRetryableError(err, skipCapacity);

      // If not retryable or we've exhausted all retries, break
      if (!retryable || attempt >= MAX_RETRIES) {
        break;
      }

      // Calculate delay with jitter
      const baseDelay = BACKOFF_SCHEDULE_MS[attempt] ?? BACKOFF_SCHEDULE_MS[BACKOFF_SCHEDULE_MS.length - 1];
      const delay = applyJitter(baseDelay);

      console.warn(
        `[${context.provider}] ${context.task} attempt ${attempt + 1}/${MAX_RETRIES + 1} failed` +
        ` (HTTP ${status ?? 'unknown'}). Retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms...`
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted — throw FAILED_PROVIDER
  const status = extractHttpStatus(lastError);
  const errorMsg =
    `[${context.provider}] FAILED_PROVIDER — ${context.task} failed after ${MAX_RETRIES + 1} attempts` +
    (status ? ` (last HTTP ${status})` : '') +
    `: ${lastError?.message ?? 'unknown error'}`;

  console.error(errorMsg);

  throw new ProviderFailedError({
    message: errorMsg,
    httpStatus: status,
    attempts: MAX_RETRIES + 1,
    provider: context.provider,
    task: context.task,
    cause: lastError,
  });
}
