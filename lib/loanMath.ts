/**
 * Shared loan math — used by both the API routes (server) and AddLoanModal
 * (client, for the live preview), so the numbers a person sees while typing
 * always match what gets saved.
 */

/**
 * Calculate annual interest rate (%) from principal, EMI, and total months
 * using the standard EMI formula: EMI = P * r * (1+r)^n / ((1+r)^n - 1)
 * We solve for r numerically via Newton-Raphson iteration.
 *
 * Used for STANDARD loans, where the person enters a flat EMI and we
 * back-calculate the implied rate.
 */
export function calcInterestRate(principal: number, emi: number, totalMonths: number): number {
  if (emi <= 0 || totalMonths <= 0 || principal <= 0) return 0;
  if (emi * totalMonths <= principal) {
    // Zero-interest loan or bad inputs — just return 0
    return 0;
  }
  let r = 0.01;
  for (let i = 0; i < 100; i++) {
    const pow = Math.pow(1 + r, totalMonths);
    const f = (principal * r * pow) / (pow - 1) - emi;
    const df =
      (principal * pow * (1 + r * totalMonths - pow + r * totalMonths * (pow - 1))) /
      Math.pow(pow - 1, 2);
    const rNew = r - f / df;
    if (Math.abs(rNew - r) < 1e-10) {
      r = rNew;
      break;
    }
    r = rNew;
  }
  return Math.round(r * 12 * 10000) / 100; // annual % rounded to 2dp
}

/** Annual rate (%) → monthly rate (decimal), e.g. 9% p.a. -> 0.0075 */
export function monthlyRateFromAnnual(annualRatePct: number): number {
  return annualRatePct / 100 / 12;
}

/**
 * Forward EMI calculation: given principal, an annual rate, and a number of
 * months, return the flat monthly installment that fully amortizes the
 * principal over that many months.
 *
 * Used for FLEXI loans, where the person enters the rate directly and we
 * compute the EMI for the post-interest-only amortizing phase.
 */
export function calcEmiFromRate(principal: number, annualRatePct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  if (annualRatePct <= 0) return Math.round((principal / months) * 100) / 100;
  const r = monthlyRateFromAnnual(annualRatePct);
  const pow = Math.pow(1 + r, months);
  const emi = (principal * r * pow) / (pow - 1);
  return Math.round(emi * 100) / 100;
}

/**
 * Interest-only installment for a flexi loan's moratorium phase: simply the
 * monthly interest on the (untouched) principal, since no part of the
 * principal is repaid during this period.
 */
export function calcInterestOnlyPayment(principal: number, annualRatePct: number): number {
  if (principal <= 0 || annualRatePct <= 0) return 0;
  return Math.round(principal * monthlyRateFromAnnual(annualRatePct) * 100) / 100;
}

/**
 * This month's accrued interest on an OPEN loan's current outstanding
 * balance. Used both to auto-fill "interest only" ledger entries and to
 * split a "payment" entry's amount into interest vs principal — since an
 * open loan has no fixed tenure, this is recomputed fresh every month off
 * whatever the balance currently is, rather than read off a pre-built
 * amortization schedule.
 */
export function calcOpenLoanMonthlyInterest(outstandingPrincipal: number, annualRatePct: number): number {
  if (outstandingPrincipal <= 0 || annualRatePct <= 0) return 0;
  return Math.round(outstandingPrincipal * monthlyRateFromAnnual(annualRatePct) * 100) / 100;
}
