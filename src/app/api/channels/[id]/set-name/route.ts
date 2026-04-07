import { NextResponse } from 'next/server';
import { setChannelName } from '@/lib/services/name-service';
import { SetChannelNameInput } from '@/lib/validation/schemas';
import { handleApiError, parseBody } from '@/lib/utils/api-helpers';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: channelId } = await params;
    const input = await parseBody(request, SetChannelNameInput);
    const channel = await setChannelName(channelId, input.name);
    return NextResponse.json(channel);
  } catch (error) {
    return handleApiError(error);
  }
}
