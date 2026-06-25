import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { fetchNavHistory, navOnOrBefore, NavHistoryPoint } from '@/lib/mfapi';
import {
  BENCHMARKS,
  categoryBenchmark,
  fetchBenchmarkHistory,
  findBenchmark,
  replicateCashflowSeries,
} from '@/lib/benchmarks';
import { lastDayOfMonth, unitsAndInvestedAsOf, splitByHoldingPeriod } from '@/lib/fundGrowth';
import { Holding, Transaction, FundGrowthData, FundGrowthPeriodType, FundGrowthPoint } from '@/types';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: holdingId } = await params;

  const { data, error } = await supabaseAdmin
    .from('holdings')
    .select('id, user_id, fund_id, created_at, fund:funds(*), transactions(*)')
    .eq('id', holdingId)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch holding for growth chart:', error);
    return NextResponse.json({ error: 'Failed to fetch holding' }, { status: 500 });
  }

  const holding = data as unknown as Holding | null;
  if (!holding || holding.user_id !== userId) {
    return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayYear = Number(todayIso.slice(0, 4));

  if (holding.transactions.length === 0) {
    const empty: FundGrowthData = {
      holdingId: holding.id,
      fundName: holding.fund.name,
      periodType: 'month',
      points: [],
      availableYears: [todayYear],
      navEstimated: false,
      currentUnits: 0,
      availableBenchmarks: BENCHMARKS.map((b) => ({ id: b.id, label: b.label })),
    };
    return NextResponse.json(empty);
  }

  const firstTxnDate = holding.transactions.reduce(
    (min, t) => (t.date < min ? t.date : min),
    holding.transactions[0].date
  );
  const firstYear = Number(firstTxnDate.slice(0, 4));
  const firstMonth = Number(firstTxnDate.slice(5, 7));

  const availableYears: number[] = [];
  for (let y = firstYear; y <= todayYear; y++) availableYears.push(y);

  const searchParams = req.nextUrl.searchParams;
  const periodTypeParam = searchParams.get('periodType');
  const periodType: FundGrowthPeriodType = periodTypeParam === 'year' ? 'year' : 'month';

  const yearParam = searchParams.get('year');
  let selectedYear = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : todayYear;
  if (selectedYear < firstYear) selectedYear = firstYear;
  if (selectedYear > todayYear) selectedYear = todayYear;

  // Historical NAVs, fetched once for the whole series rather than per point.
  // Only possible for AMFI-linked funds (those with a scheme code).
  let navHistory: NavHistoryPoint[] = [];
  let navFetchFailed = false;
  if (holding.fund.scheme_code) {
    try {
      navHistory = await fetchNavHistory(holding.fund.scheme_code);
    } catch (err) {
      console.error('Failed to fetch NAV history for fund growth chart:', err);
      navFetchFailed = true;
    }
  }

  // Fallback series built from each transaction's own recorded NAV — used
  // when the fund has no scheme code, mfapi couldn't be reached, or a date
  // falls before the earliest point mfapi has for this fund.
  const txnNavSeries: NavHistoryPoint[] = [...holding.transactions]
    .map((t) => ({ date: t.date, nav: Number(t.nav) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const fund = holding.fund;
  const hasHistory = !navFetchFailed && navHistory.length > 0 && !!fund.scheme_code;
  let navEstimated = !hasHistory;

  function navAsOf(date: string): number {
    if (date >= todayIso) {
      return Number(fund.latest_nav ?? 0);
    }
    if (hasHistory) {
      const found = navOnOrBefore(navHistory, date);
      if (found !== null) return found;
    }
    const found = navOnOrBefore(txnNavSeries, date);
    if (found !== null) {
      navEstimated = true;
      return found;
    }
    navEstimated = true;
    return Number(fund.latest_nav ?? 0);
  }

  const transactions: Transaction[] = holding.transactions;

  function buildPoint(period: string, periodEnd: string): FundGrowthPoint {
    const cutoff = periodEnd > todayIso ? todayIso : periodEnd;
    const { totalUnits, investedAmount } = unitsAndInvestedAsOf(transactions, cutoff);
    const nav = navAsOf(cutoff);
    return { period, invested: investedAmount, current: totalUnits * nav };
  }

  const points: FundGrowthPoint[] = [];
  const periodEnds: string[] = [];

  if (periodType === 'year') {
    for (let y = firstYear; y <= todayYear; y++) {
      const periodEnd = y === todayYear ? todayIso : `${y}-12-31`;
      periodEnds.push(periodEnd);
      points.push(buildPoint(String(y), periodEnd));
    }
  } else {
    const startMonth = selectedYear === firstYear ? firstMonth : 1;
    const endMonth = selectedYear === todayYear ? Number(todayIso.slice(5, 7)) : 12;
    for (let m = startMonth; m <= endMonth; m++) {
      const period = `${selectedYear}-${String(m).padStart(2, '0')}`;
      const periodEnd = lastDayOfMonth(selectedYear, m);
      periodEnds.push(periodEnd);
      points.push(buildPoint(period, periodEnd));
    }
  }

  const currentUnits = unitsAndInvestedAsOf(transactions, todayIso).totalUnits;
  const currentNav = Number(fund.latest_nav ?? 0);
  const termSplit = splitByHoldingPeriod(transactions, todayIso, currentNav);

  const result: FundGrowthData = {
    holdingId: holding.id,
    fundName: holding.fund.name,
    periodType,
    points,
    availableYears,
    navEstimated,
    currentUnits,
    termSplit,
    availableBenchmarks: BENCHMARKS.map((b) => ({ id: b.id, label: b.label })),
  };

  // Optional benchmark comparison: replays this fund's actual buy/sell
  // amounts as if they'd gone into the chosen index instead, on the same
  // dates, then values that virtual position at each chart point.
  const benchmarkParam = searchParams.get('benchmark');
  if (benchmarkParam) {
    const isAuto = benchmarkParam === 'category';
    const autoChoice = categoryBenchmark(fund.category);
    const chosen = isAuto ? autoChoice : findBenchmark(benchmarkParam);
    if (chosen) {
      try {
        const benchmarkHistory = await fetchBenchmarkHistory(chosen.yahooSymbol, firstTxnDate);
        if (benchmarkHistory.length > 0) {
          const latestPrice = benchmarkHistory[benchmarkHistory.length - 1].nav;
          const values = replicateCashflowSeries(
            transactions,
            benchmarkHistory,
            periodEnds,
            todayIso,
            latestPrice
          );
          const totalInvested = points.length > 0 ? points[points.length - 1].invested : 0;
          const latestValue = values.length > 0 ? values[values.length - 1] : 0;
          result.benchmark = {
            benchmarkId: chosen.id,
            label: chosen.label,
            isCategoryDefault: chosen.id === autoChoice.id,
            values,
            returnPct: totalInvested > 0 ? ((latestValue - totalInvested) / totalInvested) * 100 : 0,
          };
        }
      } catch (err) {
        console.error('Failed to fetch benchmark history:', err);
        // Benchmark comparison is best-effort; omit it rather than failing the whole chart.
      }
    }
  }

  return NextResponse.json(result);
}
