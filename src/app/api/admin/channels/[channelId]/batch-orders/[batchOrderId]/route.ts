import { NextRequest, NextResponse } from 'next/server';
import { getBatchOrderDetail } from '@/lib/services/batch-order-service';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string; batchOrderId: string }> }
) {
  try {
    const { batchOrderId } = await params;
    const order = await getBatchOrderDetail(batchOrderId);

    if (!order) {
      return NextResponse.json({ error: 'Batch order not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...order,
      carouselJobs: order.carouselJobs.map(j => ({
        id: j.id,
        topic: j.topic,
        direction: j.direction,
        status: j.status,
        approved: j.approved,
        createdAt: j.createdAt,
        thumbnailUrl: j.slides[0]?.imageUrl || null,
      })),
    });
  } catch (error) {
    console.error('[batch-orders/detail] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch batch order' }, { status: 500 });
  }
}
