import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: existing } = await supabaseAdmin
    .from('goal_contributions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { date, note } = body;

  const amountNum = body.amount != null ? Number(body.amount) : existing.amount;
  if (!amountNum || amountNum <= 0) {
    return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 });
  }

  const updates = {
    date: date || existing.date,
    amount: Math.round(amountNum * 100) / 100,
    note: note !== undefined ? (note ? String(note).trim() : null) : existing.note,
  };

  const { data: contribution, error } = await supabaseAdmin
    .from('goal_contributions')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !contribution) {
    console.error('Failed to update goal contribution:', error);
    return NextResponse.json({ error: 'Failed to update contribution' }, { status: 500 });
  }

  return NextResponse.json({ contribution });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: existing } = await supabaseAdmin
    .from('goal_contributions')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing || existing.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from('goal_contributions').delete().eq('id', id);
  if (error) {
    console.error('Failed to delete goal contribution:', error);
    return NextResponse.json({ error: 'Failed to delete contribution' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
