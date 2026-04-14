import { NextResponse } from 'next/server';
import { getChannel } from '@/lib/services/channel-service';
import { handleApiError } from '@/lib/utils/api-helpers';
import { prisma } from '@/lib/db/prisma';

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (body.carouselLayout === 'BOLD' || body.carouselLayout === 'DETAILED') {
      updateData.carouselLayout = body.carouselLayout;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const channel = await prisma.channel.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(channel, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
