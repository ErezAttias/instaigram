import { NextResponse } from 'next/server';
import { getAIProvider } from '@/lib/ai/provider';
import { selectConcept } from '@/lib/pipeline/steps/concept';

/**
 * POST /api/carousel/generate-angles
 *
 * Given a topic, generates 3 alternative angle suggestions.
 * Returns the user's original topic + 3 LLM-generated alternatives.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const topic = body.topic?.trim();
    if (!topic) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 });
    }

    const ai = getAIProvider();
    const dummyHook = { text: topic, type: 'HIDDEN_TRUTH' };

    // Generate 3 diverse angles in parallel
    const results = await Promise.allSettled([
      selectConcept({ topic, hook: dummyHook, direction: 'find a surprising angle' }, ai),
      selectConcept({ topic, hook: dummyHook, direction: 'find a contrarian or myth-busting angle' }, ai),
      selectConcept({ topic, hook: dummyHook, direction: 'find a behind-the-scenes or hidden-truth angle' }, ai),
    ]);

    const alternatives = results
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof selectConcept>>> => r.status === 'fulfilled')
      .map(r => ({
        concept: r.value.concept,
        angleDescription: r.value.angleDescription,
        rationale: r.value.rationale,
        mode: r.value.mode,
      }));

    return NextResponse.json({
      userTopic: topic,
      alternatives,
    });
  } catch (error) {
    console.error('[generate-angles] Error:', error);
    return NextResponse.json({ error: 'Failed to generate angles' }, { status: 500 });
  }
}
