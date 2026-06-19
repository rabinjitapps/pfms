import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/session';
import { searchAmfiSchemes } from '@/lib/amfi';

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const query = req.nextUrl.searchParams.get('q');
  if (!query || query.trim().length < 3) {
    return NextResponse.json({ error: 'Query must be at least 3 characters' }, { status: 400 });
  }

  try {
    const results = await searchAmfiSchemes(query.trim(), 25);
    return NextResponse.json({ results });
  } catch (err) {
    console.error('AMFI search failed:', err);
    return NextResponse.json({ error: 'Failed to search AMFI schemes' }, { status: 502 });
  }
}
