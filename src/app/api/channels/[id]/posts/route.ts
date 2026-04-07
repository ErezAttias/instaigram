import { NextResponse } from 'next/server';
import { getPosts } from '@/lib/services/post-service';
import { handleApiError } from '@/lib/utils/api-helpers';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const posts = await getPosts(id);
    return NextResponse.json(posts, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
