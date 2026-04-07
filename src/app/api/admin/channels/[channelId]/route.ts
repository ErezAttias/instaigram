import { NextRequest, NextResponse } from 'next/server';
import { getChannelDetail, updateChannelProfile, deleteChannel } from '@/lib/services/admin-service';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId } = await params;
    const channel = await getChannelDetail(channelId);
    return NextResponse.json(channel);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    if (msg === 'Channel not found') {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error('[admin/channels/[id]] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch channel' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId } = await params;
    await deleteChannel(channelId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[admin/channels/[id]] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete channel' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId } = await params;
    const body = await request.json();

    const data: Record<string, string> = {};
    if (body.name?.trim()) data.name = body.name.trim();
    if (body.niche?.trim()) data.niche = body.niche.trim();
    if (body.language?.trim()) data.language = body.language.trim();

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const channel = await updateChannelProfile(channelId, data);
    return NextResponse.json(channel);
  } catch (error) {
    console.error('[admin/channels/[id]] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update channel' }, { status: 500 });
  }
}
