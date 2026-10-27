import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { syncFundNavs } from '@/lib/navSync';

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
    .select('id, name, scheme_code')
    .not('scheme_code', 'is', null);

  if (fundsErr) {
    console.error('Failed to fetch funds for cron NAV refresh:', fundsErr);
    return NextResponse.json({ error: 'Failed to fetch funds' }, { status: 500 });
  }

  if (!funds || funds.length === 0) {
    return NextResponse.json({ updated: 0, message: 'No AMFI-linked funds in the system' });
  }

  const result = await syncFundNavs(funds);
  return NextResponse.json(result);
}
