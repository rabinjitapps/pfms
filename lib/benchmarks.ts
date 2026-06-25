// Benchmark index data for comparing a fund (or the whole portfolio)
// against a market index. There's no AMFI-style free NAV feed for indices,
// so this uses Yahoo Finance's public chart endpoint, which serves index
// history without an API key. Yahoo's index tickers occasionally change —
// if a symbol below stops resolving, swap in the current one from
// https://finance.yahoo.com (search the index name, the ticker is in the URL).

import { NavHistoryPoint, navOnOrBefore } from './mfapi';
import { Transaction } from '@/types';

export interface BenchmarkOption {
  id: string;
  label: string;
  yahooSymbol: string;
}

export const BENCHMARKS: BenchmarkOption[] = [
  { id: 'nifty50', label: 'Nifty 50', yahooSymbol: '^NSEI' },
  { id: 'nifty100', label: 'Nifty 100', yahooSymbol: '^CNX100' },
  { id: 'nifty500', label: 'Nifty 500', yahooSymbol: '^CRSLDX' },
  { id: 'niftyMidcap150', label: 'Nifty Midcap 150', yahooSymbol: 'NIFTYMIDCAP150.NS' },
  { id: 'niftySmallcap250', label: 'Nifty Smallcap 250', yahooSymbol: 'NIFTYSMLCAP250.NS' },
  { id: 'sensex', label: 'S&P BSE Sensex', yahooSymbol: '^BSESN' },
];

export function findBenchmark(id: string): BenchmarkOption | null {
  return BENCHMARKS.find((b) => b.id === id) ?? null;
}

// Best-effort guess at the "natural" comparison index for a fund, based on
// its free-text category string (e.g. "Equity - Mid Cap"). Falls back to
// Nifty 50 when nothing more specific matches. This is a heuristic, not a
// regulatory mapping — the dropdown always lets the user pick a different
// benchmark explicitly.
export function categoryBenchmark(category: string | null): BenchmarkOption {
  const c = (category ?? '').toLowerCase();
  if (c.includes('small cap') || c.includes('smallcap')) return BENCHMARKS[4];
  if (c.includes('mid cap') || c.includes('midcap')) return BENCHMARKS[3];
  if (c.includes('large cap') || c.includes('largecap') || c.includes('bluechip')) return BENCHMARKS[1];
  if (c.includes('flexi cap') || c.includes('multi cap') || c.includes('elss') || c.includes('focused'))
    return BENCHMARKS[2];
  return BENCHMARKS[0];
}

interface YahooChartResponse {
  chart: {
    result: Array<{
      timestamp: number[];
      indicators: { adjclose?: [{ adjclose: (number | null)[] }]; quote: [{ close: (number | null)[] }] };
    }> | null;
    error: unknown;
  };
}

// Fetches monthly-interval historical closing levels for a benchmark index,
// from `fromIso` through today. Returned ascending by date, in the same
// { date, nav } shape used for mutual fund NAV history so the existing
// navOnOrBefore() lookup helper works unchanged for either.
export async function fetchBenchmarkHistory(
  symbol: string,
  fromIso: string
): Promise<NavHistoryPoint[]> {
  const period1 = Math.floor(new Date(fromIso + 'T00:00:00Z').getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?period1=${period1}&period2=${period2}&interval=1d`;

  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) {
    throw new Error(`Yahoo Finance fetch failed: ${res.status}`);
  }
  const json = (await res.json()) as YahooChartResponse;
  const result = json.chart?.result?.[0];
  if (!result) return [];

  const closes = result.indicators.adjclose?.[0]?.adjclose ?? result.indicators.quote[0].close;
  const points: NavHistoryPoint[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const price = closes[i];
    if (price == null) continue;
    const date = new Date(result.timestamp[i] * 1000).toISOString().slice(0, 10);
    points.push({ date, nav: price });
  }
  return points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Replays a fund's (or the whole portfolio's) actual buy/sell *amounts* as
// if that same rupee amount had instead gone into the benchmark on the same
// dates — a cash-flow replication, not a unit-for-unit mirror. This is the
// standard way to ask "how would the index have done with my exact
// contribution pattern", independent of how many fund units that money
// happened to buy.
export function replicateCashflowSeries(
  transactions: Pick<Transaction, 'type' | 'date' | 'amount' | 'created_at'>[],
  benchmarkHistory: NavHistoryPoint[],
  periodEnds: string[],
  todayIso: string,
  latestBenchmarkPrice: number | null
): number[] {
  const chronological = [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.created_at < b.created_at ? -1 : 1;
  });

  let virtualUnits = 0;
  let txnIdx = 0;
  const values: number[] = [];

  for (const periodEnd of periodEnds) {
    const cutoff = periodEnd > todayIso ? todayIso : periodEnd;
    while (txnIdx < chronological.length && chronological[txnIdx].date <= cutoff) {
      const t = chronological[txnIdx];
      const priceOnDate = navOnOrBefore(benchmarkHistory, t.date);
      if (priceOnDate && priceOnDate > 0) {
        const sign = t.type === 'BUY' ? 1 : -1;
        virtualUnits += (sign * Number(t.amount)) / priceOnDate;
      }
      txnIdx++;
    }
    const priceAtCutoff =
      cutoff >= todayIso ? latestBenchmarkPrice : navOnOrBefore(benchmarkHistory, cutoff);
    values.push(virtualUnits * (priceAtCutoff ?? 0));
  }

  return values;
}
