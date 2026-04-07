import { NextResponse } from 'next/server';
import { setDirectTopic } from '@/lib/services/niche-service';
import { SetDirectTopicInput } from '@/lib/validation/schemas';
import { handleApiError, parseBody, buildDebugMeta } from '@/lib/utils/api-helpers';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const input = await parseBody(request, SetDirectTopicInput);
    const niches = await setDirectTopic(id, input.topic, input.refine);
    return NextResponse.json({ nicheOptions: niches, _debug: buildDebugMeta() }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
