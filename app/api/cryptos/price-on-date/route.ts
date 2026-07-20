import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/session';
import { fetchCryptoPriceOnDate } from '@/lib/cryptoPrice';

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const symbol = req.nextUrl.searchParams.get('symbol');
  const date = req.nextUrl.searchParams.get('date');

  if (!symbol || !date) {
    return NextResponse.json({ error: 'symbol and date are required' }, { status: 400 });
  }

  try {
    const result = await fetchCryptoPriceOnDate(symbol, date);
    if (!result) {
      return NextResponse.json(
        { error: 'No price found for this coin on or before that date' },
        { status: 404 }
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('Yahoo Finance history lookup failed:', err);
    return NextResponse.json({ error: 'Failed to reach Yahoo Finance' }, { status: 502 });
  }
}
