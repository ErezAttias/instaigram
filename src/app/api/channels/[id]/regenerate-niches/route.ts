import { NextResponse } from 'next/server';
import { regenerateMore } from '@/lib/services/niche-service';
import { RegenerateMoreInput } from '@/lib/validation/schemas';
import { handleApiError, parseBody, buildDebugMeta } from '@/lib/utils/api-helpers';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const input = await parseBody(request, RegenerateMoreInput);
    const niches = await regenerateMore(id, input.intent, input.existingTitles);
    return NextResponse.json({ nicheOptions: niches, _debug: buildDebugMeta() }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
