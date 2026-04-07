import { NextResponse } from 'next/server';
import { regenerateSlide } from '@/lib/services/regeneration-service';
import { RegenerateSlideInput } from '@/lib/validation/schemas';
import { handleApiError, parseBody, buildDebugMeta } from '@/lib/utils/api-helpers';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const input = await parseBody(request, RegenerateSlideInput);
    const slide = await regenerateSlide(id, input.slideIndex);
    return NextResponse.json({ ...slide, _debug: buildDebugMeta() }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
