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
  const { categoryId, direction, date, amount, notes, accountId } = body;

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
    .select('id, user_id, account_id')
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

  // Bank account is optional — same ownership check as on create.
  let resolvedAccountId: string | null = null;
  if (accountId) {
    const { data: account } = await supabaseAdmin
      .from('bank_accounts')
      .select('id, user_id')
      .eq('id', accountId)
      .maybeSingle();
    if (!account || account.user_id !== userId) {
      return NextResponse.json({ error: 'Bank account not found' }, { status: 404 });
    }
    resolvedAccountId = account.id;
  }

  const roundedAmount = Math.round(amountNum * 100) / 100;

  const { data: entry, error } = await supabaseAdmin
    .from('expense_entries')
    .update({
      category_id: categoryId,
      direction,
      date,
      amount: roundedAmount,
      notes: notes || null,
      account_id: resolvedAccountId,
    })
    .eq('id', id)
    .select('*, category:expense_categories(*), account:bank_accounts(id, name)')
    .single();

  if (error || !entry) {
    console.error('Failed to update expense entry:', error);
    return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 });
  }

  // Keep the mirrored bank_transactions row (if any) in sync with whatever
  // changed — including the account itself being added, removed, or swapped.
  const { data: mirrorRow } = await supabaseAdmin
    .from('bank_transactions')
    .select('id, account_id')
    .eq('expense_entry_id', id)
    .maybeSingle();

  if (resolvedAccountId && mirrorRow) {
    // Still linked to a bank account (possibly a different one) — update
    // the existing mirror row in place rather than delete+recreate, since
    // its id may be referenced elsewhere (e.g. already-expanded UI state).
    const { error: mirrorError } = await supabaseAdmin
      .from('bank_transactions')
      .update({
        account_id: resolvedAccountId,
        date,
        type: direction === 'INFLOW' ? 'credit' : 'debit',
        amount: roundedAmount,
        description: notes || entry.category?.name || null,
        category: entry.category?.name ?? null,
      })
      .eq('id', mirrorRow.id);
    if (mirrorError) {
      console.error('Failed to update mirrored bank transaction:', mirrorError);
    }
  } else if (resolvedAccountId && !mirrorRow) {
    // Account was just added to a previously-unlinked entry — create the
    // mirror row now.
    const { error: mirrorError } = await supabaseAdmin.from('bank_transactions').insert({
      user_id: userId,
      account_id: resolvedAccountId,
      date,
      type: direction === 'INFLOW' ? 'credit' : 'debit',
      amount: roundedAmount,
      description: notes || entry.category?.name || null,
      category: entry.category?.name ?? null,
      transfer_id: null,
      expense_entry_id: id,
    });
    if (mirrorError) {
      console.error('Failed to create mirrored bank transaction:', mirrorError);
    }
  } else if (!resolvedAccountId && mirrorRow) {
    // Account was removed from this entry — drop the mirror row so it
    // doesn't keep showing on a ledger it's no longer linked to.
    const { error: mirrorError } = await supabaseAdmin
      .from('bank_transactions')
      .delete()
      .eq('id', mirrorRow.id);
    if (mirrorError) {
      console.error('Failed to remove mirrored bank transaction:', mirrorError);
    }
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

  // If this entry was linked to a bank account, its mirrored bank_transactions
  // row is cleaned up automatically by the expense_entry_id ON DELETE CASCADE
  // foreign key — no separate delete needed here.
  return NextResponse.json({ success: true });
}
