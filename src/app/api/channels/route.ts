import { NextResponse } from 'next/server';
import { createChannel } from '@/lib/services/channel-service';
import { CreateChannelInput } from '@/lib/validation/schemas';
import { handleApiError, parseBody } from '@/lib/utils/api-helpers';

export async function POST(request: Request) {
  try {
    const input = await parseBody(request, CreateChannelInput);
    const channel = await createChannel({
      nicheMode: input.nicheMode,
      exploreTopic: input.exploreTopic,
      directTopic: input.directTopic,
    });
    return NextResponse.json(channel, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
