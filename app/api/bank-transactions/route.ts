import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { BankTransactionType } from '@/types';

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { date, description, category } = body;

  if (!date) {
    return NextResponse.json({ error: 'Date is required' }, { status: 400 });
  }

  const amountNum = Number(body.amount);
  if (!amountNum || amountNum <= 0) {
    return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 });
  }

  // ── Transfer between two of the person's own tracked accounts ──
  // Recorded as two rows sharing one transfer_id: a debit on the source
  // account and a credit on the destination, so each account's ledger and
  // balance stay correct independently while still being identifiable (and
  // deletable) as a single logical transfer.
  if (body.kind === 'transfer') {
    const fromAccountId = body.from_account_id;
    const toAccountId = body.to_account_id;

    if (!fromAccountId || !toAccountId) {
      return NextResponse.json({ error: 'Both accounts are required for a transfer' }, { status: 400 });
    }
    if (fromAccountId === toAccountId) {
      return NextResponse.json({ error: 'Transfer accounts must be different' }, { status: 400 });
    }

    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from('bank_accounts')
      .select('id, user_id')
      .in('id', [fromAccountId, toAccountId]);

    if (accountsError || (accounts ?? []).length !== 2 || (accounts ?? []).some((a) => a.user_id !== userId)) {
      return NextResponse.json({ error: 'One or both accounts were not found' }, { status: 404 });
    }

    const transferId = randomUUID();
    const { data: rows, error } = await supabaseAdmin
      .from('bank_transactions')
      .insert([
        {
          user_id: userId,
          account_id: fromAccountId,
          date,
          type: 'debit' as BankTransactionType,
          amount: Math.round(amountNum * 100) / 100,
          description: description ? String(description).trim() : 'Transfer',
          category: category ? String(category).trim() : 'Transfer',
          transfer_id: transferId,
        },
        {
          user_id: userId,
          account_id: toAccountId,
          date,
          type: 'credit' as BankTransactionType,
          amount: Math.round(amountNum * 100) / 100,
          description: description ? String(description).trim() : 'Transfer',
          category: category ? String(category).trim() : 'Transfer',
          transfer_id: transferId,
        },
      ])
      .select('*');

    if (error || !rows || rows.length !== 2) {
      console.error('Failed to create transfer:', error);
      return NextResponse.json({ error: 'Failed to save transfer' }, { status: 500 });
    }

    return NextResponse.json({ transactions: rows });
  }

  // ── Plain credit or debit on a single account ──
  const accountId = body.account_id;
  const type: BankTransactionType = body.type === 'debit' ? 'debit' : 'credit';

  if (!accountId) {
    return NextResponse.json({ error: 'Account is required' }, { status: 400 });
  }

  const { data: account } = await supabaseAdmin
    .from('bank_accounts')
    .select('id, user_id')
    .eq('id', accountId)
    .maybeSingle();

  if (!account || account.user_id !== userId) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const { data: transaction, error } = await supabaseAdmin
    .from('bank_transactions')
    .insert({
      user_id: userId,
      account_id: accountId,
      date,
      type,
      amount: Math.round(amountNum * 100) / 100,
      description: description ? String(description).trim() : null,
      category: category ? String(category).trim() : null,
      transfer_id: null,
    })
    .select('*')
    .single();

  if (error || !transaction) {
    console.error('Failed to create bank transaction:', error);
    return NextResponse.json({ error: 'Failed to save transaction' }, { status: 500 });
  }

  return NextResponse.json({ transaction });
}
