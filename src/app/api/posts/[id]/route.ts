import { NextResponse } from 'next/server';
import { getPost } from '@/lib/services/post-service';
import { handleApiError } from '@/lib/utils/api-helpers';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const post = await getPost(id);
    return NextResponse.json(post, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
