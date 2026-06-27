import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { buildBankPortfolioSummary } from '@/lib/bankAccounts';
import { BankTransaction } from '@/types';

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [accountsRes, transactionsRes] = await Promise.all([
    supabaseAdmin
      .from('bank_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    // All transactions across every account, fetched in one go — the
    // explicit range overrides Supabase's default 1000-row select() cap,
    // same reasoning as the expense-entries and loan routes.
    supabaseAdmin
      .from('bank_transactions')
      .select('*')
      .eq('user_id', userId)
      .range(0, 9999),
  ]);

  if (accountsRes.error) {
    console.error('Failed to fetch bank accounts:', accountsRes.error);
    return NextResponse.json({ error: 'Failed to fetch bank accounts' }, { status: 500 });
  }
  if (transactionsRes.error) {
    console.error('Failed to fetch bank transactions:', transactionsRes.error);
    return NextResponse.json({ error: 'Failed to fetch bank transactions' }, { status: 500 });
  }

  const accounts = accountsRes.data ?? [];
  const transactions = (transactionsRes.data ?? []) as BankTransaction[];

  // Attach the other leg's account name to each transfer transaction, for
  // display ("Transfer to HDFC Savings") — computed here once rather than
  // re-looked-up by the client for every row.
  const nameById = new Map(accounts.map((a) => [a.id, a.name]));
  const byTransferId = new Map<string, BankTransaction[]>();
  for (const t of transactions) {
    if (!t.transfer_id) continue;
    if (!byTransferId.has(t.transfer_id)) byTransferId.set(t.transfer_id, []);
    byTransferId.get(t.transfer_id)!.push(t);
  }
  for (const t of transactions) {
    if (!t.transfer_id) {
      t.transfer_account_name = null;
      continue;
    }
    const pair = byTransferId.get(t.transfer_id) ?? [];
    const other = pair.find((p) => p.account_id !== t.account_id);
    t.transfer_account_name = other ? nameById.get(other.account_id) ?? null : null;
  }

  const transactionsByAccount: Record<string, BankTransaction[]> = {};
  for (const t of transactions) {
    if (!transactionsByAccount[t.account_id]) transactionsByAccount[t.account_id] = [];
    transactionsByAccount[t.account_id].push(t);
  }

  const portfolio = buildBankPortfolioSummary(accounts, transactionsByAccount);

  return NextResponse.json({ portfolio });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, bank_name, account_type, account_number_last4, opening_balance, opening_date } = body;

  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: 'Account name is required' }, { status: 400 });
  }

  const last4 = account_number_last4 ? String(account_number_last4).trim().slice(-4) : null;

  const { data: account, error } = await supabaseAdmin
    .from('bank_accounts')
    .insert({
      user_id: userId,
      name: String(name).trim(),
      bank_name: bank_name ? String(bank_name).trim() : null,
      account_type: account_type ? String(account_type).trim() : null,
      account_number_last4: last4,
      opening_balance: opening_balance != null ? Math.round(Number(opening_balance) * 100) / 100 : 0,
      opening_date: opening_date || new Date().toISOString().slice(0, 10),
    })
    .select('*')
    .single();

  if (error || !account) {
    console.error('Failed to create bank account:', error);
    return NextResponse.json({ error: 'Failed to save bank account' }, { status: 500 });
  }

  return NextResponse.json({ account });
}
