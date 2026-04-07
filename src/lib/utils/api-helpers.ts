import { NextResponse } from 'next/server';
import { z } from 'zod';

const NOT_FOUND_PATTERNS = [
  'not found',
  'no niche selected',
  'no hooks',
];

function isNotFoundError(message: string): boolean {
  const lower = message.toLowerCase();
  return NOT_FOUND_PATTERNS.some(pattern => lower.includes(pattern));
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof z.ZodError) {
    console.error('[API] Validation error:', error.issues);
    return NextResponse.json(
      {
        error: error.issues.map((e: { message: string }) => e.message).join(', '),
        errorType: 'ZodError',
      },
      { status: 400 }
    );
  }

  if (error instanceof Error) {
    console.error(`[API] ${error.name}: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }

    const status = isNotFoundError(error.message) ? 404 : 400;

    return NextResponse.json(
      {
        error: error.message,
        errorType: error.name,
      },
      { status }
    );
  }

  console.error('[API] Unknown error:', error);
  return NextResponse.json(
    {
      error: 'An unexpected error occurred',
      errorType: 'UnknownError',
    },
    { status: 500 }
  );
}

export async function parseBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<T> {
  const body = await request.json();
  return schema.parse(body);
}

/**
 * Build the _debug field for API responses.
 * Includes provider/model info so callers always know what generated the data.
 * Only included when AI_DEBUG=true (opt-in).
 */
export function buildDebugMeta(): Record<string, unknown> | undefined {
  if (process.env.AI_DEBUG !== 'true') return undefined;

  const provider = process.env.USE_MOCK_PROVIDER === 'true' || !process.env.AI_PROVIDER || process.env.AI_PROVIDER === 'mock'
    ? 'mock'
    : process.env.AI_PROVIDER;

  return {
    provider,
    model: provider === 'mock' ? 'mock-deterministic' : (process.env.AI_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o'),
    mock: provider === 'mock',
  };
}
