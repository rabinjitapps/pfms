/**
 * Shared loan schedule/summary builders.
 *
 * This logic originally lived only inside LoanTracker.tsx. It's extracted
 * here so the Dashboard/Overview page can build the same EMI schedule
 * (and a date-wise upcoming-EMI list) without duplicating the rules for
 * what counts as "paid", flexi interest-only phases, etc.
 */

import { Loan, LoanSummary, LoanPortfolioSummary, LoanEmiMonth } from '@/types';

export function buildLoanSummary(loan: Loan): LoanSummary {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const manuallyPaidMonths = new Set((loan.payments ?? []).map((p) => p.month));
  const interestOnlyMonths = loan.interest_only_months ?? 0;

  const startDate = new Date(loan.emi_start_date);
  const schedule = [];

  for (let i = 0; i < loan.total_months; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const is_future = d > today;
    const auto_paid =
      d < today && d.getFullYear() * 12 + d.getMonth() < today.getFullYear() * 12 + today.getMonth();
    const manually_paid = manuallyPaidMonths.has(monthStr);
    const is_paid = auto_paid || manually_paid;
    const phase: LoanEmiMonth['phase'] = i < interestOnlyMonths ? 'interest_only' : 'emi';
    const emi_amount = phase === 'interest_only' ? loan.interest_only_payment : loan.emi_amount;

    schedule.push({
      month: monthStr,
      emi_amount,
      phase,
      is_paid,
      manually_paid,
      is_future,
    });
  }

  const paid_count = schedule.filter((s) => s.is_paid).length;
  const pending_count = loan.total_months - paid_count;
  const total_amount_paid = schedule.filter((s) => s.is_paid).reduce((sum, s) => sum + s.emi_amount, 0);
  const total_amount_pending = schedule.filter((s) => !s.is_paid).reduce((sum, s) => sum + s.emi_amount, 0);
  const percent_complete = Math.round((paid_count / loan.total_months) * 100);

  const debtFreeDate = new Date(
    startDate.getFullYear(),
    startDate.getMonth() + loan.total_months - 1,
    1
  );

  const months_remaining = pending_count;
  const years_remaining = months_remaining / 12;

  const nextDue = schedule.find((s) => !s.is_paid);
  const in_interest_only_phase = nextDue ? nextDue.phase === 'interest_only' : false;
  const interest_only_months_remaining = schedule.filter(
    (s) => !s.is_paid && s.phase === 'interest_only'
  ).length;

  return {
    loan,
    paid_count,
    pending_count,
    total_emis: loan.total_months,
    total_amount_paid,
    total_amount_pending,
    percent_complete,
    debt_free_date: debtFreeDate.toISOString(),
    months_remaining,
    years_remaining,
    emi_schedule: schedule,
    in_interest_only_phase,
    interest_only_months_remaining,
  };
}

export function buildPortfolioSummary(loans: Loan[]): LoanPortfolioSummary {
  const summaries = loans
    .map(buildLoanSummary)
    .sort((a, b) => a.pending_count - b.pending_count);

  const totalMonthlyEmi = summaries.reduce((s, ls) => {
    if (ls.pending_count <= 0) return s;
    const nextDue = ls.emi_schedule.find((m) => !m.is_paid);
    return s + (nextDue ? nextDue.emi_amount : 0);
  }, 0);
  const totalOutstanding = summaries.reduce((s, ls) => s + ls.total_amount_pending, 0);

  const today = new Date();
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const monthTotals = new Map<string, number>();
  for (const ls of summaries) {
    for (const m of ls.emi_schedule) {
      if (m.is_paid) continue;
      if (m.month <= currentMonthStr) continue;
      monthTotals.set(m.month, (monthTotals.get(m.month) ?? 0) + m.emi_amount);
    }
  }
  const upcomingMonths: LoanPortfolioSummary['upcoming_months'] = Array.from(monthTotals.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, amount]) => ({
      month,
      label: new Date(month + '-01').toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
      amount,
    }));

  return {
    loans: summaries,
    total_monthly_emi: totalMonthlyEmi,
    total_outstanding: totalOutstanding,
    upcoming_months: upcomingMonths,
  };
}

// ----------------------------------------------------------------------
// Date-wise upcoming EMIs (for the dashboard)
// ----------------------------------------------------------------------

export interface UpcomingEmi {
  date: string; // ISO YYYY-MM-DD, the actual due date for this installment
  loanId: string;
  loanName: string;
  amount: number;
  phase: LoanEmiMonth['phase'];
}

/**
 * Flatten every loan's remaining (unpaid) EMI months into individual,
 * date-stamped installments — using the day-of-month from each loan's
 * emi_start_date as its recurring due day (clipped to the length of
 * shorter months, e.g. a 31st due-day becomes the 28th/30th in Feb/Apr).
 * Returned in chronological order, soonest first.
 */
export function getUpcomingEmis(loans: Loan[], limit = 8): UpcomingEmi[] {
  const dueDay = (loan: Loan) => new Date(loan.emi_start_date).getDate();

  const out: UpcomingEmi[] = [];
  for (const loan of loans) {
    const summary = buildLoanSummary(loan);
    const day = dueDay(loan);
    for (const m of summary.emi_schedule) {
      if (m.is_paid) continue;
      const [y, mo] = m.month.split('-').map(Number);
      const lastDayOfMonth = new Date(y, mo, 0).getDate();
      const d = new Date(y, mo - 1, Math.min(day, lastDayOfMonth));
      out.push({
        date: d.toISOString().slice(0, 10),
        loanId: loan.id,
        loanName: loan.name,
        amount: m.emi_amount,
        phase: m.phase,
      });
    }
  }

  out.sort((a, b) => a.date.localeCompare(b.date));
  return out.slice(0, limit);
}
