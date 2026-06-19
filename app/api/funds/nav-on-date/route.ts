import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/session';
import { fetchNavOnDate } from '@/lib/mfapi';

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const schemeCode = req.nextUrl.searchParams.get('schemeCode');
  const date = req.nextUrl.searchParams.get('date');

  if (!schemeCode || !date) {
    return NextResponse.json({ error: 'schemeCode and date are required' }, { status: 400 });
  }

  try {
    const result = await fetchNavOnDate(schemeCode, date);
    if (!result) {
      return NextResponse.json(
        { error: 'No NAV found for this fund on or before that date' },
        { status: 404 }
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('mfapi.in lookup failed:', err);
    return NextResponse.json({ error: 'Failed to reach mfapi.in' }, { status: 502 });
  }
}
