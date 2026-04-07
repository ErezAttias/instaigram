import { NextResponse } from 'next/server';
import { getChannel } from '@/lib/services/channel-service';
import { handleApiError } from '@/lib/utils/api-helpers';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const channel = await getChannel(id);
    return NextResponse.json(channel, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
