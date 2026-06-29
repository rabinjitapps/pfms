import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { ExpenseEntry, AnalysisPeriodType, ExpenseDirection } from '@/types';

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

// Returns every individual entry that rolls up into one head's bar-chart
// total, for the same period the analysis page is showing — lets a person
// click a head in the breakdown list and see exactly what made up that
// number, rather than just the aggregate.
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;

  const categoryId = params.get('categoryId');
  if (!categoryId) {
    return NextResponse.json({ error: 'categoryId is required' }, { status: 400 });
  }

  const periodTypeParam = params.get('periodType');
  const periodType: AnalysisPeriodType = periodTypeParam === 'year' ? 'year' : 'month';

  const directionParam = params.get('direction');
  const direction: ExpenseDirection = directionParam === 'INCOME' || directionParam === 'INFLOW'
    ? 'INFLOW'
    : 'OUTFLOW';

  const periodParam = params.get('period');
  let start: string;
  let end: string;

  if (periodType === 'year') {
    const period = periodParam && /^\d{4}$/.test(periodParam) ? periodParam : currentMonth().slice(0, 4);
    const bounds = yearBounds(period);
    start = bounds.start;
    end = bounds.end;
  } else {
    const period = periodParam && /^\d{4}-\d{2}$/.test(periodParam) ? periodParam : currentMonth();
    const bounds = monthBounds(period);
    start = bounds.start;
    end = bounds.end;
  }

  // Ownership check on the head — same pattern as POST /api/expense-entries.
  const { data: category } = await supabaseAdmin
    .from('expense_categories')
    .select('id, user_id, name')
    .eq('id', categoryId)
    .maybeSingle();

  if (!category || category.user_id !== userId) {
    return NextResponse.json({ error: 'Head not found' }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from('expense_entries')
    .select('*, category:expense_categories(*), account:bank_accounts(id, name)')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .eq('direction', direction)
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    // Same explicit range override as the main entries route — without it,
    // Supabase's default 1000-row cap could silently truncate a head with a
    // very large number of entries in one period.
    .range(0, 9999);

  if (error) {
    console.error('Failed to fetch head breakdown entries:', error);
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
  }

  const entries = (data ?? []) as unknown as ExpenseEntry[];
  const total = entries.reduce((sum, e) => sum + Number(e.amount), 0);

  return NextResponse.json({
    categoryId,
    categoryName: category.name,
    entries,
    total,
  });
}
