import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/session';
import { searchStocks } from '@/lib/stockPrice';

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const query = req.nextUrl.searchParams.get('q');
  if (!query || query.trim().length < 2) {
    return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 });
  }

  try {
    const results = await searchStocks(query.trim(), 15);
    return NextResponse.json({ results });
  } catch (err) {
    console.error('Stock search failed:', err);
    return NextResponse.json({ error: 'Failed to search stocks' }, { status: 502 });
  }
}
