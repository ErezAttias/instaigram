import { NextResponse } from 'next/server';
import { generateNiches } from '@/lib/services/niche-service';
import { GenerateNichesInput } from '@/lib/validation/schemas';
import { handleApiError, buildDebugMeta } from '@/lib/utils/api-helpers';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let mode: 'DISCOVER' | 'EXPLORE' | 'DIRECT' | undefined;
    let topic: string | undefined;

    try {
      const body = await request.json();
      const parsed = GenerateNichesInput.parse(body);
      mode = parsed.mode;
      topic = parsed.topic;
    } catch {
      // No body or invalid JSON — defaults to discover mode
    }

    const niches = await generateNiches(id, mode, topic);
    return NextResponse.json({ nicheOptions: niches, _debug: buildDebugMeta() }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
