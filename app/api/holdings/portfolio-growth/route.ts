import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { fetchNavHistory, navOnOrBefore, NavHistoryPoint } from '@/lib/mfapi';
import { BENCHMARKS, fetchBenchmarkHistory, findBenchmark, replicateCashflowSeries } from '@/lib/benchmarks';
import {
  lastDayOfMonth,
  unitsAndInvestedAsOf,
  splitByHoldingPeriod,
  addTermSplits,
  emptyTermSplit,
} from '@/lib/fundGrowth';
import { Holding, Transaction, FundGrowthData, FundGrowthPeriodType, FundGrowthPoint } from '@/types';

// Combined growth-over-time across every fund the user holds — the
// "whole investment" view. Each fund contributes its own invested/current
// value at each chart point (0 before that fund's first transaction), and
// the points are summed. Mirrors /api/holdings/[id]/growth but for all
// holdings at once instead of one.
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('holdings')
    .select('id, user_id, fund_id, created_at, fund:funds(*), transactions(*)')
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to fetch holdings for portfolio growth chart:', error);
    return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500 });
  }

  const holdings = ((data ?? []) as unknown as Holding[]).filter((h) => h.transactions.length > 0);

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayYear = Number(todayIso.slice(0, 4));

  if (holdings.length === 0) {
    const empty: FundGrowthData = {
      holdingId: 'all',
      fundName: 'All funds (whole investment)',
      periodType: 'month',
      points: [],
      availableYears: [todayYear],
      navEstimated: false,
    };
    return NextResponse.json(empty);
  }

  const firstYear = Math.min(
    ...holdings.map((h) => Number(h.transactions.reduce((min, t) => (t.date < min ? t.date : min), h.transactions[0].date).slice(0, 4)))
  );

  const availableYears: number[] = [];
  for (let y = firstYear; y <= todayYear; y++) availableYears.push(y);

  const searchParams = req.nextUrl.searchParams;
  const periodTypeParam = searchParams.get('periodType');
  const periodType: FundGrowthPeriodType = periodTypeParam === 'year' ? 'year' : 'month';

  const yearParam = searchParams.get('year');
  let selectedYear = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : todayYear;
  if (selectedYear < firstYear) selectedYear = firstYear;
  if (selectedYear > todayYear) selectedYear = todayYear;

  // Fetch each fund's NAV history once, in parallel.
  const navHistories = await Promise.all(
    holdings.map(async (h) => {
      if (!h.fund.scheme_code) return [] as NavHistoryPoint[];
      try {
        return await fetchNavHistory(h.fund.scheme_code);
      } catch (err) {
        console.error('Failed to fetch NAV history for portfolio growth chart:', err);
        return [] as NavHistoryPoint[];
      }
    })
  );

  let navEstimated = false;

  function navAsOfFor(holding: Holding, history: NavHistoryPoint[], date: string): number {
    if (date >= todayIso) return Number(holding.fund.latest_nav ?? 0);
    if (history.length > 0) {
      const found = navOnOrBefore(history, date);
      if (found !== null) return found;
    }
    const txnNavSeries: NavHistoryPoint[] = [...holding.transactions]
      .map((t) => ({ date: t.date, nav: Number(t.nav) }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const found = navOnOrBefore(txnNavSeries, date);
    if (found !== null) {
      navEstimated = true;
      return found;
    }
    navEstimated = true;
    return Number(holding.fund.latest_nav ?? 0);
  }

  function buildPoint(period: string, periodEnd: string): FundGrowthPoint {
    const cutoff = periodEnd > todayIso ? todayIso : periodEnd;
    let invested = 0;
    let current = 0;
    holdings.forEach((h, idx) => {
      const { totalUnits, investedAmount } = unitsAndInvestedAsOf(h.transactions, cutoff);
      invested += investedAmount;
      current += totalUnits * navAsOfFor(h, navHistories[idx], cutoff);
    });
    return { period, invested, current };
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
    const startMonth = selectedYear === firstYear ? 1 : 1;
    const endMonth = selectedYear === todayYear ? Number(todayIso.slice(5, 7)) : 12;
    for (let m = startMonth; m <= endMonth; m++) {
      const period = `${selectedYear}-${String(m).padStart(2, '0')}`;
      const periodEnd = lastDayOfMonth(selectedYear, m);
      periodEnds.push(periodEnd);
      points.push(buildPoint(period, periodEnd));
    }
  }

  const termSplit = holdings.reduce(
    (acc, h) => addTermSplits(acc, splitByHoldingPeriod(h.transactions, todayIso, Number(h.fund.latest_nav ?? 0))),
    emptyTermSplit()
  );

  const result: FundGrowthData = {
    holdingId: 'all',
    fundName: 'All funds (whole investment)',
    periodType,
    points,
    availableYears,
    navEstimated,
    termSplit,
    availableBenchmarks: BENCHMARKS.map((b) => ({ id: b.id, label: b.label })),
  };

  const benchmarkParam = searchParams.get('benchmark');
  if (benchmarkParam) {
    const chosen = findBenchmark(benchmarkParam);
    if (chosen) {
      try {
        const earliestDate = `${firstYear}-01-01`;
        const benchmarkHistory = await fetchBenchmarkHistory(chosen.yahooSymbol, earliestDate);
        if (benchmarkHistory.length > 0) {
          const latestPrice = benchmarkHistory[benchmarkHistory.length - 1].nav;
          const allTransactions: Pick<Transaction, 'type' | 'date' | 'amount' | 'created_at'>[] = holdings.flatMap(
            (h) => h.transactions
          );
          const values = replicateCashflowSeries(
            allTransactions,
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
            isCategoryDefault: false,
            values,
            returnPct: totalInvested > 0 ? ((latestValue - totalInvested) / totalInvested) * 100 : 0,
          };
        }
      } catch (err) {
        console.error('Failed to fetch benchmark history for portfolio growth chart:', err);
      }
    }
  }

  return NextResponse.json(result);
}
