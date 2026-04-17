import { NextResponse } from 'next/server';
import { getAIProvider } from '@/lib/ai/provider';
import { z } from 'zod';

// LLM call can easily exceed the 10s hobby-plan default; allow up to 60s.
export const maxDuration = 60;

const PreviewSchema = z.object({
  facts: z.array(z.string()).min(3).max(3),
});

/**
 * POST /api/carousel/generate-angles
 *
 * Given a topic, generates 3 sample fact titles as a preview
 * of the kind of content the carousel will contain.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const topic = body.topic?.trim();
    if (!topic) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 });
    }

    const ai = getAIProvider();

    const { data } = await ai.generateObject(
      `Given this Instagram carousel topic: "${topic}"

Generate exactly 3 sample fact titles that represent the kind of content this carousel would contain. Each title should be a specific, surprising fact — the kind of thing someone would screenshot and send to a friend.

Rules:
- Each fact is 8–16 words
- Must be specific (include a number, name, or concrete detail)
- Must be genuinely surprising or counterintuitive
- Must be diverse (don't repeat the same pattern)

Return JSON: { "facts": ["fact 1", "fact 2", "fact 3"] }`,
      PreviewSchema,
    );

    return NextResponse.json({
      userTopic: topic,
      sampleFacts: data.facts,
    });
  } catch (error) {
    console.error('[generate-angles] Error:', error);
    return NextResponse.json({ error: 'Failed to generate preview' }, { status: 500 });
  }
}
