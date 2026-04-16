import { NextRequest, NextResponse } from 'next/server';
import {
  generateSimpleCarousel,
  type SimpleModelId,
} from '@/lib/pipeline-simple/generate';

export const maxDuration = 120;

const MODELS: SimpleModelId[] = [
  'gpt-4o',
  'claude-sonnet-4-5',
  'claude-opus-4-6',
  'gemini-2.5-pro',
];

/**
 * Dev-only A/B test endpoint.
 * Runs the simple one-shot prompt across multiple models in parallel
 * and returns each model's output for side-by-side comparison.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Dev endpoint disabled in production' }, { status: 404 });
  }

  let body: { topic?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const topic = body.topic?.trim();
  if (!topic) {
    return NextResponse.json({ error: 'topic is required' }, { status: 400 });
  }

  const settled = await Promise.allSettled(
    MODELS.map((modelId) => generateSimpleCarousel(topic, modelId)),
  );

  const results = MODELS.map((modelId, i) => {
    const r = settled[i];
    return r.status === 'fulfilled'
      ? { modelId, ok: true as const, slides: r.value.slides, latencyMs: r.value.latencyMs }
      : { modelId, ok: false as const, error: errorMessage(r.reason) };
  });

  return NextResponse.json({ topic, results });
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
