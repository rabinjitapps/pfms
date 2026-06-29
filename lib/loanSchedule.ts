/**
 * Shared loan schedule/summary builders.
 *
 * This logic originally lived only inside LoanTracker.tsx. It's extracted
 * here so the Dashboard/Overview page can build the same EMI schedule
 * (and a date-wise upcoming-EMI list) without duplicating the rules for
 * what counts as "paid", flexi interest-only phases, etc.
 */

import { Loan, LoanSummary, LoanPortfolioSummary, LoanEmiMonth } from '@/types';
import { monthlyRateFromAnnual } from '@/lib/loanMath';

/**
 * Reducing-balance amortization: walk the loan's full schedule month by
 * month, splitting each installment into its principal and interest
 * components, so we can report "of the ₹X still outstanding, ₹Y is
 * principal and ₹Z is interest" — rather than treating the remaining
 * amount as undifferentiated rupees.
 *
 * Mirrors the same phase rules as buildLoanSummary (flexi's interest-only
 * months don't reduce the balance at all; monthly/standard amortize for
 * the full tenure) using loan.interest_rate, which is always stored as
 * the annual equivalent regardless of loan_type.
 *
 * Returns one entry per scheduled month, in order, so callers can sum
 * whichever subset they need (e.g. only the unpaid ones).
 */
function buildAmortizationSchedule(
  loan: Loan
): { principal_component: number; interest_component: number }[] {
  const monthlyRate = monthlyRateFromAnnual(loan.interest_rate);
  const interestOnlyMonths = loan.interest_only_months ?? 0;
  let balance = loan.principal;
  const out: { principal_component: number; interest_component: number }[] = [];

  for (let i = 0; i < loan.total_months; i++) {
    const interestComponent = Math.round(balance * monthlyRate * 100) / 100;

    if (i < interestOnlyMonths) {
      // Interest-only phase: the whole installment is interest, balance
      // (principal) is untouched.
      out.push({ principal_component: 0, interest_component: interestComponent });
      continue;
    }

    const isLastMonth = i === loan.total_months - 1;
    // On the final installment, retire whatever balance is left exactly —
    // avoids a stray paisa of drift from rounding accumulating over the
    // life of the loan.
    const principalComponent = isLastMonth
      ? balance
      : Math.max(0, Math.min(balance, loan.emi_amount - interestComponent));

    out.push({
      principal_component: Math.round(principalComponent * 100) / 100,
      interest_component: interestComponent,
    });
    balance = Math.round((balance - principalComponent) * 100) / 100;
  }

  return out;
}

export function buildLoanSummary(loan: Loan): LoanSummary {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const manuallyPaidMonths = new Set((loan.payments ?? []).map((p) => p.month));
  const interestOnlyMonths = loan.interest_only_months ?? 0;

  const startDate = new Date(loan.emi_start_date);
  const schedule = [];
  // Computed once up front so each month's cell can show its own
  // principal/interest split (interest-only months are all-interest;
  // everything else follows the reducing-balance amortization).
  const amortizationByMonth = buildAmortizationSchedule(loan);

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
    const amort = amortizationByMonth[i];

    schedule.push({
      month: monthStr,
      emi_amount,
      phase,
      is_paid,
      manually_paid,
      is_future,
      principal_component: amort?.principal_component ?? 0,
      interest_component: amort?.interest_component ?? 0,
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

  // Total interest over the full life of the loan (running + completed
  // installments combined) — the sum of every scheduled payment (interest-only
  // + EMI) minus the principal actually borrowed. This is fixed by the loan's
  // terms and doesn't change as installments get paid off.
  const total_payable = schedule.reduce((sum, s) => sum + s.emi_amount, 0);
  const total_interest = Math.max(0, total_payable - loan.principal);

  // Split of what's still outstanding into principal vs interest. The flat
  // "remaining EMIs" total (total_amount_pending) mixes both together, so we
  // sum each unpaid month's already-computed principal/interest components —
  // this tells a person how much of what's left is money they borrowed vs
  // money the lender still charges them on top.
  let outstanding_principal = 0;
  let outstanding_interest = 0;
  schedule.forEach((s) => {
    if (s.is_paid) return;
    outstanding_principal += s.principal_component;
    outstanding_interest += s.interest_component;
  });
  outstanding_principal = Math.round(outstanding_principal * 100) / 100;
  outstanding_interest = Math.round(outstanding_interest * 100) / 100;

  const is_closed = pending_count <= 0;

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
    total_interest,
    outstanding_principal,
    outstanding_interest,
    is_closed,
  };
}

export function buildPortfolioSummary(loans: Loan[]): LoanPortfolioSummary {
  const summaries = loans
    .map(buildLoanSummary)
    .sort((a, b) => a.pending_count - b.pending_count);

  // Closed loans (fully paid off) are tracked separately from active ones —
  // they're excluded from every "currently owed" figure below (EMI, totals,
  // upcoming months, debt-free date) since they no longer contribute debt,
  // but their history is still shown to the person in its own section.
  const activeSummaries = summaries.filter((ls) => !ls.is_closed);
  const closedSummaries = summaries.filter((ls) => ls.is_closed);

  const totalMonthlyEmi = activeSummaries.reduce((s, ls) => {
    const nextDue = ls.emi_schedule.find((m) => !m.is_paid);
    return s + (nextDue ? nextDue.emi_amount : 0);
  }, 0);
  const totalOutstanding = activeSummaries.reduce((s, ls) => s + ls.total_amount_pending, 0);
  const totalInterest = activeSummaries.reduce((s, ls) => s + ls.total_interest, 0);
  const totalOutstandingPrincipal = activeSummaries.reduce((s, ls) => s + ls.outstanding_principal, 0);
  const totalOutstandingInterest = activeSummaries.reduce((s, ls) => s + ls.outstanding_interest, 0);

  const today = new Date();
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const monthTotals = new Map<string, number>();
  for (const ls of activeSummaries) {
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

  // Portfolio-wide debt-free countdown: the whole portfolio is only debt
  // free once its slowest-finishing loan is paid off, so the date is the
  // latest debt_free_date among loans that still have something pending.
  // Progress is the combined EMI count paid across every loan, mirroring
  // the per-loan percent_complete so the two read consistently.
  const totalEmisAll = summaries.reduce((s, ls) => s + ls.total_emis, 0);
  const paidCountAll = summaries.reduce((s, ls) => s + ls.paid_count, 0);
  const percentComplete = totalEmisAll > 0 ? Math.round((paidCountAll / totalEmisAll) * 100) : 100;
  const totalAmountPaidAll = summaries.reduce((s, ls) => s + ls.total_amount_paid, 0);

  const pendingSummaries = summaries.filter((ls) => ls.pending_count > 0);
  const debtFreeDate =
    pendingSummaries.length > 0
      ? pendingSummaries.reduce(
          (latest, ls) => (ls.debt_free_date > latest ? ls.debt_free_date : latest),
          pendingSummaries[0].debt_free_date
        )
      : new Date().toISOString();

  return {
    loans: activeSummaries,
    closed_loans: closedSummaries,
    total_monthly_emi: totalMonthlyEmi,
    total_outstanding: totalOutstanding,
    total_outstanding_principal: totalOutstandingPrincipal,
    total_outstanding_interest: totalOutstandingInterest,
    total_interest: totalInterest,
    upcoming_months: upcomingMonths,
    percent_complete: percentComplete,
    debt_free_date: debtFreeDate,
    total_amount_paid: totalAmountPaidAll,
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
