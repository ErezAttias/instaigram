import { NextResponse } from 'next/server';
import { regenerateHook } from '@/lib/services/regeneration-service';
import { handleApiError, buildDebugMeta } from '@/lib/utils/api-helpers';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const post = await regenerateHook(id);
    return NextResponse.json({ ...post, _debug: buildDebugMeta() }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
