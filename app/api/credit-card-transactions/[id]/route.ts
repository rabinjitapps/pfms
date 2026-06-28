import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: existing } = await supabaseAdmin
    .from('credit_card_transactions')
    .select('id, user_id, expense_entry_id, bank_transaction_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing || existing.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // A spend linked to an expense entry is edited from the Expenses page, so
  // the two never drift apart — same rule already applied to bank
  // transactions mirrored from an expense entry.
  if (existing.expense_entry_id) {
    return NextResponse.json(
      { error: 'This spend is linked to an expense entry — edit it from the Expenses page instead.' },
      { status: 400 }
    );
  }
  // A payment linked to a bank debit is edited from the Bank Accounts page,
  // for the same reason.
  if (existing.bank_transaction_id) {
    return NextResponse.json(
      { error: 'This payment is linked to a bank transaction — edit it from the Bank Accounts page instead.' },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { date, description, category } = body;

  const amountNum = Number(body.amount);
  if (!amountNum || amountNum <= 0) {
    return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 });
  }
  if (!date) {
    return NextResponse.json({ error: 'Date is required' }, { status: 400 });
  }

  const { data: transaction, error } = await supabaseAdmin
    .from('credit_card_transactions')
    .update({
      date,
      amount: Math.round(amountNum * 100) / 100,
      description: description ? String(description).trim() : null,
      category: category ? String(category).trim() : null,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error || !transaction) {
    console.error('Failed to update credit card transaction:', error);
    return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 });
  }

  return NextResponse.json({ transaction });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: existing } = await supabaseAdmin
    .from('credit_card_transactions')
    .select('id, user_id, expense_entry_id, bank_transaction_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing || existing.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // If this spend was logged as an expense entry, delete that instead —
  // it cascades back to remove this row too, so both sides disappear
  // together rather than leaving a dangling entry on the Expenses page.
  if (existing.expense_entry_id) {
    const { error: entryError } = await supabaseAdmin
      .from('expense_entries')
      .delete()
      .eq('id', existing.expense_entry_id)
      .eq('user_id', userId);
    if (entryError) {
      console.error('Failed to delete source expense entry for card spend:', entryError);
      return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  // If this payment was mirrored as a bank debit, remove that too — no FK
  // cascade exists for this pairing (by design, see schema notes), so it's
  // handled explicitly here.
  if (existing.bank_transaction_id) {
    await supabaseAdmin
      .from('bank_transactions')
      .delete()
      .eq('id', existing.bank_transaction_id)
      .eq('user_id', userId);
  }

  const { error } = await supabaseAdmin.from('credit_card_transactions').delete().eq('id', id);

  if (error) {
    console.error('Failed to delete credit card transaction:', error);
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
