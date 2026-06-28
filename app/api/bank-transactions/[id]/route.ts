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
    .from('bank_transactions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Transfers are edited by deleting and re-adding (so both legs always stay
  // in sync) — editing in place here is only for ordinary credit/debit rows.
  if (existing.transfer_id) {
    return NextResponse.json(
      { error: 'Transfers can’t be edited directly — delete it and add a new one instead.' },
      { status: 400 }
    );
  }

  // Same idea for a row mirrored from an income/expense entry — it has to
  // be edited from the Expenses page so the two stay in sync, rather than
  // letting this side drift out of step with the entry that created it.
  if (existing.expense_entry_id) {
    return NextResponse.json(
      { error: 'This transaction came from an expense/income entry — edit it from the Expenses page instead.' },
      { status: 400 }
    );
  }

  // Same idea again for a row paired with a credit card payment — edit it
  // from the Credit Cards page so both sides stay in sync.
  if (existing.credit_card_transaction_id) {
    return NextResponse.json(
      { error: 'This transaction is a credit card payment — edit it from the Credit Cards page instead.' },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { date, description, category } = body;

  const amountNum = body.amount != null ? Number(body.amount) : existing.amount;
  if (!amountNum || amountNum <= 0) {
    return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 });
  }

  const updates = {
    date: date || existing.date,
    type: body.type === 'debit' || body.type === 'credit' ? body.type : existing.type,
    amount: Math.round(amountNum * 100) / 100,
    description: description !== undefined ? (description ? String(description).trim() : null) : existing.description,
    category: category !== undefined ? (category ? String(category).trim() : null) : existing.category,
  };

  const { data: transaction, error } = await supabaseAdmin
    .from('bank_transactions')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !transaction) {
    console.error('Failed to update bank transaction:', error);
    return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 });
  }

  return NextResponse.json({ transaction });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: existing } = await supabaseAdmin
    .from('bank_transactions')
    .select('id, user_id, transfer_id, expense_entry_id, credit_card_transaction_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing || existing.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // This row exists only because an income/expense entry was logged against
  // this account — delete that entry instead, which cascades back to remove
  // this mirrored row too. Deleting just this row would leave a dangling
  // entry on the Expenses page with no ledger trace.
  if (existing.expense_entry_id) {
    const { error: entryError } = await supabaseAdmin
      .from('expense_entries')
      .delete()
      .eq('id', existing.expense_entry_id)
      .eq('user_id', userId);
    if (entryError) {
      console.error('Failed to delete source expense entry for mirrored transaction:', entryError);
      return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  // This row exists only because a payment was logged against a credit
  // card — delete the paired credit_card_transactions row too, so the
  // payment disappears from both ledgers together. No FK cascade handles
  // this (by design — either side can be deleted first), so it's explicit.
  if (existing.credit_card_transaction_id) {
    const { error: cardTxnError } = await supabaseAdmin
      .from('credit_card_transactions')
      .delete()
      .eq('id', existing.credit_card_transaction_id)
      .eq('user_id', userId);
    if (cardTxnError) {
      console.error('Failed to delete paired credit card transaction:', cardTxnError);
      return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
    }
    const { error } = await supabaseAdmin.from('bank_transactions').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete bank transaction:', error);
      return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  // Deleting one leg of a transfer removes both, scoped to this user, so the
  // ledger never ends up with an orphaned half of a transfer.
  const { error } = existing.transfer_id
    ? await supabaseAdmin
        .from('bank_transactions')
        .delete()
        .eq('transfer_id', existing.transfer_id)
        .eq('user_id', userId)
    : await supabaseAdmin.from('bank_transactions').delete().eq('id', id);

  if (error) {
    console.error('Failed to delete bank transaction:', error);
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
