import { NextRequest, NextResponse } from 'next/server';
import { createBatchOrder, runBatchOrder, getChannelBatchOrders } from '@/lib/services/batch-order-service';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId } = await params;
    const orders = await getChannelBatchOrders(channelId);
    return NextResponse.json(orders);
  } catch (error) {
    console.error('[batch-orders] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch batch orders' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId } = await params;
    const body = await request.json();

    const size = Math.min(Math.max(Math.round(body.size || 5), 1), 10);
    const topics = Array.isArray(body.topics) ? body.topics.filter((t: unknown) => typeof t === 'string' && (t as string).trim()) : undefined;
    const direction = body.direction?.trim() || undefined;

    const order = await createBatchOrder(channelId, size, topics, direction);

    // Fire and forget — progress tracked in DB
    runBatchOrder(order.id).catch(err => {
      console.error(`[batch-orders] Background execution failed for ${order.id}:`, err instanceof Error ? err.message : err);
    });

    return NextResponse.json({ batchOrderId: order.id, status: order.status }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[batch-orders] POST error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
