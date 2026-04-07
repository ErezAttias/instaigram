import { NextResponse } from 'next/server';
import { generateChannelNames } from '@/lib/services/name-service';
import { GenerateChannelNamesInput } from '@/lib/validation/schemas';
import { handleApiError, parseBody, buildDebugMeta } from '@/lib/utils/api-helpers';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: channelId } = await params;
    const input = await parseBody(request, GenerateChannelNamesInput);
    const names = await generateChannelNames(channelId, input.style);
    return NextResponse.json({ names, _debug: buildDebugMeta() });
  } catch (error) {
    return handleApiError(error);
  }
}
