import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { fetchAllAmfiNavs } from '@/lib/amfi';

export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get the distinct funds (with a scheme code) this user holds
  const { data: holdings, error: holdingsErr } = await supabaseAdmin
    .from('holdings')
    .select('fund:funds(id, scheme_code)')
    .eq('user_id', userId);

  if (holdingsErr) {
    console.error('Failed to fetch holdings for NAV refresh:', holdingsErr);
    return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500 });
  }

  const fundsWithCode = (holdings ?? [])
    .map((h) => h.fund as unknown as { id: string; scheme_code: string | null })
    .filter((f) => f && f.scheme_code);

  if (fundsWithCode.length === 0) {
    return NextResponse.json({ updated: 0, message: 'No AMFI-linked funds to update' });
  }

  let allNavs;
  try {
    allNavs = await fetchAllAmfiNavs();
  } catch (err) {
    console.error('AMFI fetch failed:', err);
    return NextResponse.json({ error: 'Failed to reach AMFI' }, { status: 502 });
  }

  const navByScheme = new Map(allNavs.map((r) => [r.schemeCode, r]));

  let updated = 0;
  for (const fund of fundsWithCode) {
    const row = navByScheme.get(fund.scheme_code as string);
    if (!row) continue;

    await supabaseAdmin
      .from('funds')
      .update({ latest_nav: row.nav, latest_nav_date: row.date, updated_at: new Date().toISOString() })
      .eq('id', fund.id);

    await supabaseAdmin
      .from('nav_history')
      .upsert({ fund_id: fund.id, date: row.date, nav: row.nav }, { onConflict: 'fund_id,date' });

    updated += 1;
  }

  return NextResponse.json({ updated, total: fundsWithCode.length });
}
