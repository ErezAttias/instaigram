import { NextRequest, NextResponse } from 'next/server';
import { searchWikipediaImage, searchWikipediaImages } from '@/lib/ai/wikipedia-search';

// Wikipedia/Commons API calls can be slow; give ample headroom.
export const maxDuration = 30;

/**
 * GET /api/wikipedia-search?q=<query>[&gallery=1]
 *
 * Default: returns a single `WikipediaSearchResult` (the article's lead image).
 * With `gallery=1`: returns `{ results: WikipediaSearchResult[] }` with up to
 * 8 images pulled from the article, so the user can pick from alternatives.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim();
  const gallery = request.nextUrl.searchParams.get('gallery') === '1';
  if (!q) {
    return NextResponse.json({ error: 'q parameter is required' }, { status: 400 });
  }

  try {
    if (gallery) {
      const results = await searchWikipediaImages(q);
      if (results.length === 0) {
        return NextResponse.json(
          { error: `No Wikipedia images found for "${q}". Try a different query.` },
          { status: 404 },
        );
      }
      return NextResponse.json({ results });
    }

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
