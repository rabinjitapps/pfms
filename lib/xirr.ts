// XIRR (extended internal rate of return) for irregular cash flows, the standard
// way to measure annualized return when money goes in/out on arbitrary dates
// (SIPs, lump sums, redemptions) rather than a single lump sum held for a fixed term.

export interface CashFlow {
  date: string; // yyyy-mm-dd
  amount: number; // negative = money out (BUY), positive = money in (SELL or current value)
}

const DAY_MS = 1000 * 60 * 60 * 24;

function npv(rate: number, flows: CashFlow[], t0: number): number {
  return flows.reduce((sum, f) => {
    const days = (new Date(f.date).getTime() - t0) / DAY_MS;
    return sum + f.amount / Math.pow(1 + rate, days / 365);
  }, 0);
}

function npvDerivative(rate: number, flows: CashFlow[], t0: number): number {
  return flows.reduce((sum, f) => {
    const days = (new Date(f.date).getTime() - t0) / DAY_MS;
    const years = days / 365;
    if (years === 0) return sum;
    return sum - (years * f.amount) / Math.pow(1 + rate, years + 1);
  }, 0);
}

/**
 * Solves for the annualized rate that makes the NPV of the cash flows zero,
 * using Newton-Raphson with a bisection fallback. Returns null if it can't
 * converge (e.g. all flows are the same sign, or too little data).
 */
export function xirr(flows: CashFlow[]): number | null {
  const sorted = [...flows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (sorted.length < 2) return null;

  const hasPositive = sorted.some((f) => f.amount > 0);
  const hasNegative = sorted.some((f) => f.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  const t0 = new Date(sorted[0].date).getTime();

  // Newton-Raphson
  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const value = npv(rate, sorted, t0);
    const deriv = npvDerivative(rate, sorted, t0);
    if (Math.abs(deriv) < 1e-10) break;
    const newRate = rate - value / deriv;
    if (!isFinite(newRate)) break;
    if (Math.abs(newRate - rate) < 1e-7) {
      rate = newRate;
      return isFinite(rate) && rate > -1 ? rate : null;
    }
    rate = newRate;
  }

  // Fallback: bisection over a wide, sane range
  let lo = -0.999;
  let hi = 10;
  let nLo = npv(lo, sorted, t0);
  let nHi = npv(hi, sorted, t0);
  if (nLo * nHi > 0) return null; // no sign change, can't bisect

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const nMid = npv(mid, sorted, t0);
    if (Math.abs(nMid) < 1e-6) return mid;
    if (nLo * nMid < 0) {
      hi = mid;
      nHi = nMid;
    } else {
      lo = mid;
      nLo = nMid;
    }
  }

  return (lo + hi) / 2;
}
