import { NextResponse } from 'next/server';
import { approveContentStrategy } from '@/lib/services/content-strategy-service';
import { ApproveContentPillarsInput, ApproveContentStrategyInput } from '@/lib/validation/schemas';
import { handleApiError, parseBody } from '@/lib/utils/api-helpers';

/**
 * POST /api/channels/:id/approve-content-strategy
 *
 * Approves and stores the content pillars on the channel.
 * Accepts either the new pillars format { pillars, channelTone?, channelAudience? }
 * or the legacy single-strategy format { contentStrategy }.
 * Transitions status to STRATEGY_DEFINED, unlocking post generation.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // New multi-pillar format
    if (body.pillars) {
      const input = ApproveContentPillarsInput.parse(body);
      const channel = await approveContentStrategy(id, input.pillars, input.channelTone, input.channelAudience);
      return NextResponse.json(channel, { status: 200 });
    }

    // Legacy single-strategy format (backwards compat)
    const input = ApproveContentStrategyInput.parse(body);
    const channel = await approveContentStrategy(id, [input.contentStrategy]);
    return NextResponse.json(channel, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
