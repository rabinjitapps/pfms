import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { buildCreditCardPortfolioSummary } from '@/lib/creditCards';
import { CreditCardTransaction } from '@/types';

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [cardsRes, transactionsRes] = await Promise.all([
    supabaseAdmin
      .from('credit_cards')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    // All transactions across every card, fetched in one go — the explicit
    // range overrides Supabase's default 1000-row select() cap, same
    // reasoning as the bank-accounts and expense-entries routes.
    supabaseAdmin
      .from('credit_card_transactions')
      .select('*')
      .eq('user_id', userId)
      .range(0, 9999),
  ]);

  if (cardsRes.error) {
    console.error('Failed to fetch credit cards:', cardsRes.error);
    return NextResponse.json({ error: 'Failed to fetch credit cards' }, { status: 500 });
  }
  if (transactionsRes.error) {
    console.error('Failed to fetch credit card transactions:', transactionsRes.error);
    return NextResponse.json({ error: 'Failed to fetch credit card transactions' }, { status: 500 });
  }

  const cards = cardsRes.data ?? [];
  const transactions = (transactionsRes.data ?? []) as CreditCardTransaction[];

  // Attach the paying bank account's name to each payment row, for display
  // ("Paid from HDFC Savings") — looked up once here rather than re-fetched
  // by the client for every row.
  const paymentBankTxnIds = transactions
    .filter((t) => t.bank_transaction_id)
    .map((t) => t.bank_transaction_id as string);

  let bankAccountNameByTxnId = new Map<string, string>();
  if (paymentBankTxnIds.length > 0) {
    const { data: bankTxns } = await supabaseAdmin
      .from('bank_transactions')
      .select('id, account_id')
      .in('id', paymentBankTxnIds);
    if (bankTxns && bankTxns.length > 0) {
      const accountIds = [...new Set(bankTxns.map((t) => t.account_id))];
      const { data: accounts } = await supabaseAdmin.from('bank_accounts').select('id, name').in('id', accountIds);
      const nameByAccountId = new Map((accounts ?? []).map((a) => [a.id, a.name]));
      bankAccountNameByTxnId = new Map(
        bankTxns.map((t) => [t.id, nameByAccountId.get(t.account_id) ?? 'a bank account'])
      );
    }
  }
  for (const t of transactions) {
    t.bank_account_name = t.bank_transaction_id ? bankAccountNameByTxnId.get(t.bank_transaction_id) ?? null : null;
  }

  const transactionsByCard: Record<string, CreditCardTransaction[]> = {};
  for (const t of transactions) {
    if (!transactionsByCard[t.card_id]) transactionsByCard[t.card_id] = [];
    transactionsByCard[t.card_id].push(t);
  }

  const portfolio = buildCreditCardPortfolioSummary(cards, transactionsByCard);

  return NextResponse.json({ portfolio });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    name,
    bank_name,
    card_network,
    card_number_last4,
    credit_limit,
    statement_day,
    due_day,
    opening_balance,
    opening_date,
    current_statement_balance,
    current_minimum_due,
    notes,
  } = body;

  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: 'Card name is required' }, { status: 400 });
  }

  const statementDay = Math.min(31, Math.max(1, Number(statement_day) || 1));
  const dueDay = Math.min(31, Math.max(1, Number(due_day) || 1));
  const last4 = card_number_last4 ? String(card_number_last4).trim().slice(-4) : null;

  const { data: card, error } = await supabaseAdmin
    .from('credit_cards')
    .insert({
      user_id: userId,
      name: String(name).trim(),
      bank_name: bank_name ? String(bank_name).trim() : null,
      card_network: card_network ? String(card_network).trim() : null,
      card_number_last4: last4,
      credit_limit: credit_limit != null ? Math.round(Number(credit_limit) * 100) / 100 : 0,
      statement_day: statementDay,
      due_day: dueDay,
      opening_balance: opening_balance != null ? Math.round(Number(opening_balance) * 100) / 100 : 0,
      opening_date: opening_date || new Date().toISOString().slice(0, 10),
      current_statement_balance:
        current_statement_balance != null && current_statement_balance !== ''
          ? Math.round(Number(current_statement_balance) * 100) / 100
          : null,
      current_minimum_due:
        current_minimum_due != null && current_minimum_due !== ''
          ? Math.round(Number(current_minimum_due) * 100) / 100
          : null,
      notes: notes ? String(notes).trim() : null,
    })
    .select('*')
    .single();

  if (error || !card) {
    console.error('Failed to create credit card:', error);
    return NextResponse.json({ error: 'Failed to save credit card' }, { status: 500 });
  }

  return NextResponse.json({ card });
}
