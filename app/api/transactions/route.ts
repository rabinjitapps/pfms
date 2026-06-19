import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { holdingId, type, date, units, nav, notes } = body;

  if (!holdingId || !type || !date || !units || !nav) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (type !== 'BUY' && type !== 'SELL') {
    return NextResponse.json({ error: 'Type must be BUY or SELL' }, { status: 400 });
  }

  const unitsNum = Number(units);
  const navNum = Number(nav);

  if (unitsNum <= 0 || navNum <= 0) {
    return NextResponse.json({ error: 'Units and NAV must be positive' }, { status: 400 });
  }

  // Ownership check
  const { data: holding } = await supabaseAdmin
    .from('holdings')
    .select('id, user_id')
    .eq('id', holdingId)
    .maybeSingle();

  if (!holding || holding.user_id !== userId) {
    return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
  }

  const amount = Math.round(unitsNum * navNum * 100) / 100;

  const { data: transaction, error } = await supabaseAdmin
    .from('transactions')
    .insert({
      holding_id: holdingId,
      type,
      date,
      units: unitsNum,
      nav: navNum,
      amount,
      notes: notes ?? null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Failed to create transaction:', error);
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
  }

  return NextResponse.json({ transaction });
}
