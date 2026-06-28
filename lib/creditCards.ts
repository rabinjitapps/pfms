/**
 * Shared credit-card math — used by the API route (server) so the
 * outstanding balance, utilization, and due-date countdown a person sees
 * always come from one place.
 *
 * A credit card is modeled as the mirror image of a bank account: a
 * 'spend' raises the outstanding balance (like a debit lowers a bank
 * balance), and a 'payment' or 'refund' lowers it (like a credit raises
 * one).
 */

import { CreditCard, CreditCardPortfolioSummary, CreditCardSummary, CreditCardTransaction } from '@/types';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The next due date relative to "today", given the card's due_day
 * (1-31). If today is past this month's due day, the next one is next
 * month's; clamped to each month's actual last day so a due_day of 31
 * still works in February.
 */
function nextDueDate(dueDay: number, today: Date): Date {
  const clampDay = (year: number, month: number, day: number) => {
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(day, lastDayOfMonth));
  };

  const thisMonth = clampDay(today.getFullYear(), today.getMonth(), dueDay);
  if (thisMonth.getTime() >= today.getTime()) return thisMonth;

  // This month's due date already passed — but it's still "the" due date
  // to show as overdue until the next one rolls around, so only advance
  // to next month once this month's has actually passed.
  return clampDay(today.getFullYear(), today.getMonth() + 1, dueDay);
}

/** Calendar-accurate day count from today to a target date (negative if the target is in the past). */
function daysUntil(target: Date, today: Date): number {
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function buildCardSummary(card: CreditCard, transactions: CreditCardTransaction[]): CreditCardSummary {
  const sorted = [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.created_at < b.created_at ? -1 : 1;
  });

  let running = card.opening_balance;
  let totalSpend = 0;
  let totalPayments = 0;

  const ledger = sorted.map((t) => {
    if (t.type === 'spend') {
      running += t.amount;
      totalSpend += t.amount;
    } else {
      // payment or refund both reduce what's owed
      running -= t.amount;
      totalPayments += t.amount;
    }
    return { ...t, running_balance: round2(running) };
  });

  const balance = round2(running);
  const availableCredit = Math.max(0, round2(card.credit_limit - balance));
  const utilizationPct = card.credit_limit > 0 ? round2((balance / card.credit_limit) * 100) : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = nextDueDate(card.due_day, today);
  const daysOut = daysUntil(due, today);

  return {
    card,
    balance,
    available_credit: availableCredit,
    utilization_pct: utilizationPct,
    total_spend: round2(totalSpend),
    total_payments: round2(totalPayments),
    transactions: ledger,
    next_due_date: due.toISOString().slice(0, 10),
    days_until_due: daysOut,
    // Overdue only means something if there's actually a balance left to
    // pay — a card sitting at ₹0 owed past its due date isn't "overdue".
    is_overdue: daysOut < 0 && balance > 0,
  };
}

export function buildCreditCardPortfolioSummary(
  cards: CreditCard[],
  transactionsByCard: Record<string, CreditCardTransaction[]>
): CreditCardPortfolioSummary {
  const summaries = cards.map((c) => buildCardSummary(c, transactionsByCard[c.id] ?? []));
  return {
    cards: summaries,
    total_balance: round2(summaries.reduce((sum, s) => sum + s.balance, 0)),
    total_credit_limit: round2(summaries.reduce((sum, s) => sum + s.card.credit_limit, 0)),
    total_available_credit: round2(summaries.reduce((sum, s) => sum + s.available_credit, 0)),
  };
}
