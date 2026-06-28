import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { CreditCardTransactionType } from '@/types';

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { card_id, date, description, category } = body;
  const type: CreditCardTransactionType = ['spend', 'payment', 'refund'].includes(body.type) ? body.type : 'spend';

  if (!card_id) return NextResponse.json({ error: 'Card is required' }, { status: 400 });
  if (!date) return NextResponse.json({ error: 'Date is required' }, { status: 400 });

  const amountNum = Number(body.amount);
  if (!amountNum || amountNum <= 0) {
    return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 });
  }
  const amount = Math.round(amountNum * 100) / 100;

  const { data: card } = await supabaseAdmin
    .from('credit_cards')
    .select('id, user_id, name')
    .eq('id', card_id)
    .maybeSingle();

  if (!card || card.user_id !== userId) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  }

  // ── A spend can optionally also be logged as an expense entry, so it
  // shows up in Expense Analysis by category. Optional — many people would
  // rather track card spend here without doubling it into the expense
  // tracker too.
  let expenseEntryId: string | null = null;
  if (type === 'spend' && body.expense_category_id) {
    const { data: expenseCategory } = await supabaseAdmin
      .from('expense_categories')
      .select('id, user_id')
      .eq('id', body.expense_category_id)
      .maybeSingle();
    if (!expenseCategory || expenseCategory.user_id !== userId) {
      return NextResponse.json({ error: 'Expense head not found' }, { status: 404 });
    }

    const { data: entry, error: entryError } = await supabaseAdmin
      .from('expense_entries')
      .insert({
        user_id: userId,
        category_id: expenseCategory.id,
        direction: 'OUTFLOW',
        date,
        amount,
        notes: description ? String(description).trim() : null,
        // Bank accounts hold money you have; a credit card spend isn't
        // money leaving a bank account at the time of the swipe, so this
        // intentionally has no account_id — it'll get one implicitly once
        // the card itself is paid off via a bank payment, recorded as its
        // own separate transaction at that time.
        account_id: null,
      })
      .select('id')
      .single();

    if (entryError || !entry) {
      console.error('Failed to create linked expense entry for card spend:', entryError);
      return NextResponse.json({ error: 'Failed to save linked expense entry' }, { status: 500 });
    }
    expenseEntryId = entry.id;
  }

  // ── A payment can optionally also be recorded as a debit on a bank
  // account, so that account's balance and ledger reflect the money
  // actually leaving it. Shared via bank_transaction_id, the same idea as
  // a bank-to-bank transfer's transfer_id.
  let bankTransactionId: string | null = null;
  if (type === 'payment' && body.bank_account_id) {
    const { data: account } = await supabaseAdmin
      .from('bank_accounts')
      .select('id, user_id')
      .eq('id', body.bank_account_id)
      .maybeSingle();
    if (!account || account.user_id !== userId) {
      return NextResponse.json({ error: 'Bank account not found' }, { status: 404 });
    }

    bankTransactionId = randomUUID();
    const { error: bankError } = await supabaseAdmin.from('bank_transactions').insert({
      id: bankTransactionId,
      user_id: userId,
      account_id: account.id,
      date,
      type: 'debit',
      amount,
      description: description ? String(description).trim() : `Payment to ${card.name}`,
      category: category ? String(category).trim() : 'Credit Card Payment',
      transfer_id: null,
      expense_entry_id: null,
      credit_card_transaction_id: null, // filled in just below, once we know this row's id
    });
    if (bankError) {
      console.error('Failed to create linked bank transaction for card payment:', bankError);
      return NextResponse.json({ error: 'Failed to save linked bank transaction' }, { status: 500 });
    }
  }

  const { data: transaction, error } = await supabaseAdmin
    .from('credit_card_transactions')
    .insert({
      user_id: userId,
      card_id: card.id,
      date,
      type,
      amount,
      description: description ? String(description).trim() : null,
      category: category ? String(category).trim() : null,
      expense_entry_id: expenseEntryId,
      bank_transaction_id: bankTransactionId,
    })
    .select('*')
    .single();

  if (error || !transaction) {
    console.error('Failed to create credit card transaction:', error);
    // Roll back whatever side-effect rows were already created, so a
    // failure here doesn't leave a dangling expense entry or bank debit
    // with nothing on the card side to show for it.
    if (expenseEntryId) await supabaseAdmin.from('expense_entries').delete().eq('id', expenseEntryId);
    if (bankTransactionId) await supabaseAdmin.from('bank_transactions').delete().eq('id', bankTransactionId);
    return NextResponse.json({ error: 'Failed to save transaction' }, { status: 500 });
  }

  // Now that the card transaction has an id, point the bank row's
  // credit_card_transaction_id back at it — completes the two-way link.
  if (bankTransactionId) {
    const { error: linkError } = await supabaseAdmin
      .from('bank_transactions')
      .update({ credit_card_transaction_id: transaction.id })
      .eq('id', bankTransactionId);
    if (linkError) {
      console.error('Failed to complete bank<->card payment link:', linkError);
    }
  }

  return NextResponse.json({ transaction });
}
