/**
 * Shared bank-account math — used by the API route (server) so the running
 * balance and account totals a person sees always come from one place.
 */

import { BankAccount, BankAccountSummary, BankPortfolioSummary, BankTransaction } from '@/types';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Build a single account's summary: chronological ledger (ascending by date,
 * then created_at) with a running balance after every entry, plus the
 * current balance and all-time credit/debit totals.
 */
export function buildAccountSummary(
  account: BankAccount,
  transactions: BankTransaction[]
): BankAccountSummary {
  const sorted = [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.created_at < b.created_at ? -1 : 1;
  });

  let running = account.opening_balance;
  let totalCredits = 0;
  let totalDebits = 0;

  const ledger = sorted.map((t) => {
    if (t.type === 'credit') {
      running += t.amount;
      totalCredits += t.amount;
    } else {
      running -= t.amount;
      totalDebits += t.amount;
    }
    return { ...t, running_balance: round2(running) };
  });

  return {
    account,
    balance: round2(running),
    total_credits: round2(totalCredits),
    total_debits: round2(totalDebits),
    transactions: ledger,
  };
}

/** Build every account's summary plus the combined balance across all of them. */
export function buildBankPortfolioSummary(
  accounts: BankAccount[],
  transactionsByAccount: Record<string, BankTransaction[]>
): BankPortfolioSummary {
  const summaries = accounts.map((acc) => buildAccountSummary(acc, transactionsByAccount[acc.id] ?? []));
  // Highest-balance account first — lets a person see at a glance where
  // most of their money currently sits, rather than in arbitrary/creation order.
  summaries.sort((a, b) => b.balance - a.balance);
  const totalBalance = summaries.reduce((sum, s) => sum + s.balance, 0);
  return { accounts: summaries, total_balance: round2(totalBalance) };
}
