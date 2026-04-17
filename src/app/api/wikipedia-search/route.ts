import { NextRequest, NextResponse } from 'next/server';
import { searchWikipediaImage } from '@/lib/ai/wikipedia-search';

// Wikipedia/Commons API calls can be slow; give ample headroom.
export const maxDuration = 30;

/**
 * GET /api/wikipedia-search?q=<query>
 *
 * Looks up a single Wikipedia image matching the query. Powers the
 * Wikipedia option in ImagePreviewStep's per-slide source picker.
 *
 * Response: WikipediaSearchResult | { error: string }
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim();
  if (!q) {
    return NextResponse.json({ error: 'q parameter is required' }, { status: 400 });
  }

  try {
    const result = await searchWikipediaImage(q);
    if (!result) {
      return NextResponse.json(
        { error: `No Wikipedia image found for "${q}". Try a different query.` },
        { status: 404 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/wikipedia-search] Error:', err);
    return NextResponse.json({ error: 'Wikipedia search failed' }, { status: 500 });
  }
}
