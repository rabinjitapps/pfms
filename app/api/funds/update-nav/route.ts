import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';

export async function PATCH(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { fundId, nav, date } = body;

  if (!fundId || !nav) {
    return NextResponse.json({ error: 'fundId and nav are required' }, { status: 400 });
  }

  const navNum = Number(nav);
  if (navNum <= 0) {
    return NextResponse.json({ error: 'NAV must be positive' }, { status: 400 });
  }

  const navDate = date || new Date().toISOString().slice(0, 10);

  const { error } = await supabaseAdmin
    .from('funds')
    .update({ latest_nav: navNum, latest_nav_date: navDate, updated_at: new Date().toISOString() })
    .eq('id', fundId);

  if (error) {
    console.error('Failed to update NAV manually:', error);
    return NextResponse.json({ error: 'Failed to update NAV' }, { status: 500 });
  }

  await supabaseAdmin
    .from('nav_history')
    .upsert({ fund_id: fundId, date: navDate, nav: navNum }, { onConflict: 'fund_id,date' });

  return NextResponse.json({ success: true });
}
