import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { goal_id, date, note } = body;

  if (!goal_id) {
    return NextResponse.json({ error: 'Goal is required' }, { status: 400 });
  }
  if (!date) {
    return NextResponse.json({ error: 'Date is required' }, { status: 400 });
  }

  const amountNum = Number(body.amount);
  if (!amountNum || amountNum <= 0) {
    return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 });
  }

  const { data: goal } = await supabaseAdmin
    .from('goals')
    .select('id, user_id')
    .eq('id', goal_id)
    .maybeSingle();

  if (!goal || goal.user_id !== userId) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  const { data: contribution, error } = await supabaseAdmin
    .from('goal_contributions')
    .insert({
      user_id: userId,
      goal_id,
      date,
      amount: Math.round(amountNum * 100) / 100,
      note: note ? String(note).trim() : null,
    })
    .select('*')
    .single();

  if (error || !contribution) {
    console.error('Failed to create goal contribution:', error);
    return NextResponse.json({ error: 'Failed to save contribution' }, { status: 500 });
  }

  return NextResponse.json({ contribution });
}
