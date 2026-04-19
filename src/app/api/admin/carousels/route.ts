import { NextResponse } from 'next/server';
import { getAllCarousels } from '@/lib/services/admin-service';

/**
 * GET /api/admin/carousels
 *
 * Flattened dashboard feed — every carousel across every channel, most-recent
 * first. Powers the dashboard at `/admin`.
 */
export async function GET() {
  try {
    const carousels = await getAllCarousels();
    return NextResponse.json(carousels);
  } catch (err) {
    console.error('[api/admin/carousels] Error:', err);
    return NextResponse.json({ error: 'Failed to load carousels' }, { status: 500 });
  }
}
