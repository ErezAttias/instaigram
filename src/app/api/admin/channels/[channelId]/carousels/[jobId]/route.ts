import { NextRequest, NextResponse } from 'next/server';
import { deleteCarousel } from '@/lib/services/admin-service';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string; jobId: string }> }
) {
  try {
    const { jobId } = await params;
    await deleteCarousel(jobId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[admin/carousels/[jobId]] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete carousel' }, { status: 500 });
  }
}
