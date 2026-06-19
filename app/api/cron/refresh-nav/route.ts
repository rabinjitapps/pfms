import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAllAmfiNavs } from '@/lib/amfi';

// Protect this route with a shared secret so only Vercel Cron (or you) can trigger it.
function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: funds, error: fundsErr } = await supabaseAdmin
    .from('funds')
    .select('id, scheme_code')
    .not('scheme_code', 'is', null);

  if (fundsErr) {
    console.error('Failed to fetch funds for cron NAV refresh:', fundsErr);
    return NextResponse.json({ error: 'Failed to fetch funds' }, { status: 500 });
  }

  if (!funds || funds.length === 0) {
    return NextResponse.json({ updated: 0, message: 'No AMFI-linked funds in the system' });
  }

  let allNavs;
  try {
    allNavs = await fetchAllAmfiNavs();
  } catch (err) {
    console.error('AMFI fetch failed in cron:', err);
    return NextResponse.json({ error: 'Failed to reach AMFI' }, { status: 502 });
  }

  const navByScheme = new Map(allNavs.map((r) => [r.schemeCode, r]));
  let updated = 0;

  for (const fund of funds) {
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

  return NextResponse.json({ updated, total: funds.length });
}
