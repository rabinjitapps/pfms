// Shared FIFO cost-basis helpers for fund value-over-time calculations.
// Used by both the single-holding growth route and the whole-portfolio
// (all funds combined) growth route, plus the long-term/short-term split,
// so the lot-walking logic lives in exactly one place.

import { Transaction } from '@/types';

export function lastDayOfMonth(year: number, month1to12: number): string {
  // Day 0 of next month rolls back to the last day of `month1to12`.
  const d = new Date(year, month1to12, 0);
  return `${year}-${String(month1to12).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + 'T00:00:00').getTime();
  const b = new Date(toIso + 'T00:00:00').getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// FIFO cost-basis + units held, restricted to transactions on/before `asOf`.
export function unitsAndInvestedAsOf(transactions: Transaction[], asOf: string) {
  const relevant = transactions.filter((t) => t.date <= asOf);
  const chronological = [...relevant].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.created_at < b.created_at ? -1 : 1;
  });

  type Lot = { remainingUnits: number; costPerUnit: number };
  const lots: Lot[] = [];
  let buyUnits = 0;
  let sellUnits = 0;

  for (const t of chronological) {
    const units = Number(t.units);
    if (t.type === 'BUY') {
      buyUnits += units;
      const costPerUnit = units > 0 ? Number(t.amount) / units : 0;
      lots.push({ remainingUnits: units, costPerUnit });
    } else {
      sellUnits += units;
      let toSell = units;
      for (const lot of lots) {
        if (toSell <= 0) break;
        if (lot.remainingUnits <= 0) continue;
        const consumed = Math.min(lot.remainingUnits, toSell);
        lot.remainingUnits -= consumed;
        toSell -= consumed;
      }
    }
  }

  const totalUnits = buyUnits - sellUnits;
  const investedAmount = lots.reduce((sum, l) => sum + l.remainingUnits * l.costPerUnit, 0);
  return { totalUnits, investedAmount };
}

export interface TermBucket {
  units: number;
  invested: number;
  currentValue: number;
}

export interface TermSplit {
  shortTerm: TermBucket; // lots held < thresholdDays as of `asOf`
  longTerm: TermBucket; // lots held >= thresholdDays as of `asOf`
}

// Walks the same FIFO lots as unitsAndInvestedAsOf, but keeps each lot's
// purchase date so the units still held can be split into "long term"
// (>= 365 days old, the common equity-MF capital-gains cutoff in India)
// and "short term" buckets, each valued at `currentNav`.
export function splitByHoldingPeriod(
  transactions: Transaction[],
  asOf: string,
  currentNav: number,
  thresholdDays = 365
): TermSplit {
  const relevant = transactions.filter((t) => t.date <= asOf);
  const chronological = [...relevant].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.created_at < b.created_at ? -1 : 1;
  });

  type Lot = { remainingUnits: number; costPerUnit: number; date: string };
  const lots: Lot[] = [];

  for (const t of chronological) {
    const units = Number(t.units);
    if (t.type === 'BUY') {
      const costPerUnit = units > 0 ? Number(t.amount) / units : 0;
      lots.push({ remainingUnits: units, costPerUnit, date: t.date });
    } else {
      let toSell = units;
      for (const lot of lots) {
        if (toSell <= 0) break;
        if (lot.remainingUnits <= 0) continue;
        const consumed = Math.min(lot.remainingUnits, toSell);
        lot.remainingUnits -= consumed;
        toSell -= consumed;
      }
    }
  }

  const shortTerm: TermBucket = { units: 0, invested: 0, currentValue: 0 };
  const longTerm: TermBucket = { units: 0, invested: 0, currentValue: 0 };

  for (const lot of lots) {
    if (lot.remainingUnits <= 0) continue;
    const bucket = daysBetween(lot.date, asOf) >= thresholdDays ? longTerm : shortTerm;
    bucket.units += lot.remainingUnits;
    bucket.invested += lot.remainingUnits * lot.costPerUnit;
    bucket.currentValue += lot.remainingUnits * currentNav;
  }

  return { shortTerm, longTerm };
}

export function addTermSplits(a: TermSplit, b: TermSplit): TermSplit {
  return {
    shortTerm: {
      units: a.shortTerm.units + b.shortTerm.units,
      invested: a.shortTerm.invested + b.shortTerm.invested,
      currentValue: a.shortTerm.currentValue + b.shortTerm.currentValue,
    },
    longTerm: {
      units: a.longTerm.units + b.longTerm.units,
      invested: a.longTerm.invested + b.longTerm.invested,
      currentValue: a.longTerm.currentValue + b.longTerm.currentValue,
    },
  };
}

export const emptyTermSplit = (): TermSplit => ({
  shortTerm: { units: 0, invested: 0, currentValue: 0 },
  longTerm: { units: 0, invested: 0, currentValue: 0 },
});
