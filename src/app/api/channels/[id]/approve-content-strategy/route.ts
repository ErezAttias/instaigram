import { NextResponse } from 'next/server';
import { approveContentStrategy } from '@/lib/services/content-strategy-service';
import { ApproveContentStrategyInput } from '@/lib/validation/schemas';
import { handleApiError, parseBody } from '@/lib/utils/api-helpers';

/**
 * POST /api/channels/:id/approve-content-strategy
 *
 * Approves and stores the content strategy on the channel.
 * Transitions status to STRATEGY_DEFINED, unlocking post generation.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const input = await parseBody(request, ApproveContentStrategyInput);
    const channel = await approveContentStrategy(id, input.contentStrategy);
    return NextResponse.json(channel, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
