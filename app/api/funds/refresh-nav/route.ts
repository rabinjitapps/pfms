import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { syncFundNavs, FundToSync } from '@/lib/navSync';

export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Every fund this user holds (manual-only funds are counted as "skipped")
  const { data: holdings, error: holdingsErr } = await supabaseAdmin
    .from('holdings')
    .select('fund:funds(id, name, scheme_code)')
    .eq('user_id', userId);

  if (holdingsErr) {
    console.error('Failed to fetch holdings for NAV refresh:', holdingsErr);
    return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500 });
  }

  const funds: FundToSync[] = (holdings ?? [])
    .map((h) => {
      const f = h.fund as unknown;
      // Supabase types a to-one embed loosely; tolerate object or single-item array
      return (Array.isArray(f) ? f[0] : f) as FundToSync | null | undefined;
    })
    .filter((f): f is FundToSync => !!f);

  const result = await syncFundNavs(funds);
  return NextResponse.json(result);
}
