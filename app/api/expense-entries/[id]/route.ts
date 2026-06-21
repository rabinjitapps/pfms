import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { categoryId, direction, date, amount, notes } = body;

  if (!categoryId || !direction || !date || !amount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (direction !== 'INFLOW' && direction !== 'OUTFLOW') {
    return NextResponse.json({ error: 'Direction must be INFLOW or OUTFLOW' }, { status: 400 });
  }

  const amountNum = Number(amount);
  if (!amountNum || amountNum <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from('expense_entries')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing || existing.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Ownership check on the head — same rule as creating an entry, so an
  // edit can't be used to silently re-file a row under someone else's head.
  const { data: category } = await supabaseAdmin
    .from('expense_categories')
    .select('id, user_id')
    .eq('id', categoryId)
    .maybeSingle();

  if (!category || category.user_id !== userId) {
    return NextResponse.json({ error: 'Head not found' }, { status: 404 });
  }

  const { data: entry, error } = await supabaseAdmin
    .from('expense_entries')
    .update({
      category_id: categoryId,
      direction,
      date,
      amount: Math.round(amountNum * 100) / 100,
      notes: notes || null,
    })
    .eq('id', id)
    .select('*, category:expense_categories(*)')
    .single();

  if (error || !entry) {
    console.error('Failed to update expense entry:', error);
    return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 });
  }

  return NextResponse.json({ entry });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { data: entry } = await supabaseAdmin
    .from('expense_entries')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!entry || entry.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from('expense_entries').delete().eq('id', id);

  if (error) {
    console.error('Failed to delete expense entry:', error);
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
