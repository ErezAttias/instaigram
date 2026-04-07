import { NextRequest, NextResponse } from 'next/server';
import { getChannelsWithStats, createQuickChannel } from '@/lib/services/admin-service';

export async function GET() {
  try {
    const channels = await getChannelsWithStats();
    return NextResponse.json(channels);
  } catch (error) {
    console.error('[admin/channels] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = body.name?.trim();
    const niche = body.niche?.trim();

    if (!name || !niche) {
      return NextResponse.json({ error: 'name and niche are required' }, { status: 400 });
    }

    const channel = await createQuickChannel({
      name,
      niche,
      language: body.language?.trim() || 'en',
    });

    return NextResponse.json(channel, { status: 201 });
  } catch (error) {
    console.error('[admin/channels] POST error:', error);
    return NextResponse.json({ error: 'Failed to create channel' }, { status: 500 });
  }
}
