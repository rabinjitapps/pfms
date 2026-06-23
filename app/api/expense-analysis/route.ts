import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { ExpenseAnalysis, ExpenseHeadTotal, AnalysisPeriodType, ExpenseDirection } from '@/types';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function monthBounds(month: string): { start: string; end: string } {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1;
  const start = `${month}-01`;
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  const end = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

function yearBounds(year: string): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;

  const periodTypeParam = params.get('periodType');
  const periodType: AnalysisPeriodType = periodTypeParam === 'year' ? 'year' : 'month';

  const directionParam = params.get('direction');
  const direction: ExpenseDirection = directionParam === 'INCOME' || directionParam === 'INFLOW'
    ? 'INFLOW'
    : 'OUTFLOW';

  const periodParam = params.get('period');
  let period: string;
  let start: string;
  let end: string;

  if (periodType === 'year') {
    period = periodParam && /^\d{4}$/.test(periodParam) ? periodParam : currentMonth().slice(0, 4);
    const bounds = yearBounds(period);
    start = bounds.start;
    end = bounds.end;
  } else {
    period = periodParam && /^\d{4}-\d{2}$/.test(periodParam) ? periodParam : currentMonth();
    const bounds = monthBounds(period);
    start = bounds.start;
    end = bounds.end;
  }

  const [totalsRpcRes, monthsRpcRes] = await Promise.all([
    // Head-wise totals computed inside Postgres — see schema.sql for why
    // (avoids the same row-cap truncation bug that previously broke
    // carry-forward once a user's entry count grew past 1000).
    supabaseAdmin.rpc('expense_head_totals', {
      p_user_id: userId,
      p_direction: direction,
      p_start_date: start,
      p_end_date: end,
    }),
    supabaseAdmin.rpc('expense_available_months', { p_user_id: userId }),
  ]);

  if (totalsRpcRes.error) {
    console.error('Failed to compute expense head totals:', totalsRpcRes.error);
    return NextResponse.json({ error: 'Failed to fetch analysis' }, { status: 500 });
  }
  if (monthsRpcRes.error) {
    console.error('Failed to fetch expense entry months:', monthsRpcRes.error);
    return NextResponse.json({ error: 'Failed to fetch analysis' }, { status: 500 });
  }

  const totals: ExpenseHeadTotal[] = (
    (totalsRpcRes.data ?? []) as { category_id: string; category_name: string; total: number }[]
  ).map((r) => ({
    categoryId: r.category_id,
    categoryName: r.category_name,
    total: Number(r.total),
  }));

  const grandTotal = totals.reduce((sum, t) => sum + t.total, 0);

  const availableMonths = ((monthsRpcRes.data ?? []) as { month: string }[]).map((r) => r.month);
  if (!availableMonths.includes(currentMonth())) {
    availableMonths.push(currentMonth());
  }
  const availableYears = Array.from(new Set(availableMonths.map((m) => m.slice(0, 4)))).sort();

  const analysis: ExpenseAnalysis = {
    periodType,
    period,
    direction,
    availableYears,
    totals,
    grandTotal,
  };

  return NextResponse.json(analysis);
}
