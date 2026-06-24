import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { fetchNavHistory, navOnOrBefore, NavHistoryPoint } from '@/lib/mfapi';
import { Holding, Transaction, FundGrowthData, FundGrowthPeriodType, FundGrowthPoint } from '@/types';

function lastDayOfMonth(year: number, month1to12: number): string {
  // Day 0 of next month rolls back to the last day of `month1to12`.
  const d = new Date(year, month1to12, 0);
  return `${year}-${String(month1to12).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// FIFO cost-basis + units held, restricted to transactions on/before `asOf`.
// Mirrors the lot-walking logic in GET /api/holdings, kept independent here
// since every point on the chart needs the state as of a different cutoff.
function unitsAndInvestedAsOf(transactions: Transaction[], asOf: string) {
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

  const transactions = holding.transactions;

  function buildPoint(period: string, periodEnd: string): FundGrowthPoint {
    const cutoff = periodEnd > todayIso ? todayIso : periodEnd;
    const { totalUnits, investedAmount } = unitsAndInvestedAsOf(transactions, cutoff);
    const nav = navAsOf(cutoff);
    return { period, invested: investedAmount, current: totalUnits * nav };
  }

  const points: FundGrowthPoint[] = [];

  if (periodType === 'year') {
    for (let y = firstYear; y <= todayYear; y++) {
      const periodEnd = y === todayYear ? todayIso : `${y}-12-31`;
      points.push(buildPoint(String(y), periodEnd));
    }
  } else {
    const startMonth = selectedYear === firstYear ? firstMonth : 1;
    const endMonth = selectedYear === todayYear ? Number(todayIso.slice(5, 7)) : 12;
    for (let m = startMonth; m <= endMonth; m++) {
      const period = `${selectedYear}-${String(m).padStart(2, '0')}`;
      const periodEnd = lastDayOfMonth(selectedYear, m);
      points.push(buildPoint(period, periodEnd));
    }
  }

  const result: FundGrowthData = {
    holdingId: holding.id,
    fundName: holding.fund.name,
    periodType,
    points,
    availableYears,
    navEstimated,
  };

  return NextResponse.json(result);
}
