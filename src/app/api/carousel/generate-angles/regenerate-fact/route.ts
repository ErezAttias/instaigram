import { NextResponse } from 'next/server';
import { getAIProvider } from '@/lib/ai/provider';
import { z } from 'zod';

export const maxDuration = 60;

const Schema = z.object({
  fact: z.string().min(8),
});

/**
 * POST /api/carousel/generate-angles/regenerate-fact
 *
 * Given a topic and the user's existing sample facts, returns a single
 * fresh fact that's distinct from the ones already on screen. Used by the
 * "regenerate this fact" hover button on the homepage preview.
 *
 * Body: { topic: string; existingFacts: string[] }
 * Returns: { fact: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const topic = body.topic?.trim();
    const existing: string[] = Array.isArray(body.existingFacts)
      ? body.existingFacts.filter((f: unknown): f is string => typeof f === 'string')
      : [];

    if (!topic) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 });
    }

    const ai = getAIProvider();

    const existingList = existing.length
      ? existing.map((f, i) => `${i + 1}. "${f}"`).join('\n')
      : '(none yet)';

    const { data } = await ai.generateObject(
      `Topic: "${topic}"

Generate exactly ONE new sample fact title for an Instagram carousel about this topic. It must be different from these facts the user has already seen:
${existingList}

Rules:
- 8–16 words
- Specific — include a number, name, or concrete detail
- Genuinely surprising or counterintuitive
- A different angle / pattern from the existing facts above (don't repeat their structure)

Return JSON: { "fact": "..." }`,
      Schema,
    );

    return NextResponse.json({ fact: data.fact });
  } catch (error) {
    console.error('[regenerate-fact] Error:', error);
    return NextResponse.json({ error: 'Failed to regenerate fact' }, { status: 500 });
  }
}
