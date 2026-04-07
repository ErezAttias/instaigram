import { NextResponse } from 'next/server';
import { selectNiche } from '@/lib/services/niche-service';
import { SelectNicheInput } from '@/lib/validation/schemas';
import { handleApiError, parseBody } from '@/lib/utils/api-helpers';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const input = await parseBody(request, SelectNicheInput);
    const channel = await selectNiche(id, input.nicheOptionId);
    return NextResponse.json(channel, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
