import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { ExpenseEntry, ExpenseSummary } from '@/types';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function monthBounds(month: string): { start: string; end: string } {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1; // 0-indexed
  const start = `${month}-01`;
  // Day 0 of the following month = last day of this month.
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  const end = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const monthParam = req.nextUrl.searchParams.get('month');
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonth();
  const { start, end } = monthBounds(month);

  const [categoriesRes, entriesRes, monthsRpcRes, carryForwardRpcRes, usageRes] = await Promise.all([
    supabaseAdmin
      .from('expense_categories')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('expense_entries')
      .select('*, category:expense_categories(*)')
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      // Explicit range override — without this, Supabase's default 1000-row
      // select() cap would silently truncate a single month's entries too,
      // for any month busy enough to cross that threshold on its own.
      .range(0, 9999),
    // Distinct months with at least one entry, computed inside Postgres —
    // pulling every entry's date over the network just to dedupe it
    // client-side hit Supabase's default 1000-row select() cap once total
    // entries grew past 1000, silently truncating the available month range.
    supabaseAdmin.rpc('expense_available_months', { p_user_id: userId }),
    // Running balance from every entry strictly before this month, summed
    // inside Postgres for the same reason — the previous select()-then-
    // reduce() approach silently truncated at 1000 rows once a user's
    // history grew past that, which is exactly what broke carry-forward
    // starting around July for accounts with several months of entries.
    supabaseAdmin.rpc('expense_carry_forward', { p_user_id: userId, p_before_date: start }),
    // All-time category_id of every entry, used only to rank heads by how
    // often they're used (most-used first) in the dropdowns below — not
    // scoped to the current month, so the ordering stays stable as you
    // browse between months.
    supabaseAdmin
      .from('expense_entries')
      .select('category_id')
      .eq('user_id', userId)
      .range(0, 9999),
  ]);

  if (categoriesRes.error) {
    console.error('Failed to fetch expense categories:', categoriesRes.error);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }
  if (usageRes.error) {
    console.error('Failed to fetch expense category usage:', usageRes.error);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }
  if (entriesRes.error) {
    console.error('Failed to fetch expense entries:', entriesRes.error);
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
  }
  if (monthsRpcRes.error) {
    console.error('Failed to fetch expense entry months:', monthsRpcRes.error);
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
  }
  if (carryForwardRpcRes.error) {
    console.error('Failed to compute carry-forward balance:', carryForwardRpcRes.error);
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
  }

  const entries = (entriesRes.data ?? []) as unknown as ExpenseEntry[];

  const totalInflow = entries
    .filter((e) => e.direction === 'INFLOW')
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const totalOutflow = entries
    .filter((e) => e.direction === 'OUTFLOW')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const carryForward = Number(carryForwardRpcRes.data ?? 0);

  const availableMonths = ((monthsRpcRes.data ?? []) as { month: string }[]).map((r) => r.month);
  // Always include the current month, so "today" is always reachable
  // even before the very first entry is logged.
  if (!availableMonths.includes(currentMonth())) {
    availableMonths.push(currentMonth());
  }
  availableMonths.sort();

  // Rank heads by how often they're actually used (all-time entry count),
  // so the dropdowns surface the ones you reach for most instead of making
  // you hunt alphabetically every time. Ties (including zero-use heads)
  // fall back to alphabetical order.
  const usageCounts = new Map<string, number>();
  for (const row of (usageRes.data ?? []) as { category_id: string }[]) {
    usageCounts.set(row.category_id, (usageCounts.get(row.category_id) ?? 0) + 1);
  }
  const categories = [...(categoriesRes.data ?? [])].sort((a, b) => {
    const countDiff = (usageCounts.get(b.id) ?? 0) - (usageCounts.get(a.id) ?? 0);
    if (countDiff !== 0) return countDiff;
    return a.name.localeCompare(b.name);
  });

  const summary: ExpenseSummary = {
    month,
    availableMonths,
    carryForward,
    totalInflow,
    totalOutflow,
    net: totalInflow - totalOutflow,
    netWithCarryForward: carryForward + totalInflow - totalOutflow,
    categories,
    entries,
  };

  return NextResponse.json(summary);
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { categoryId, direction, date, amount, notes } = body;

  if (!categoryId || !direction || !date || !amount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (direction !== 'INFLOW' && direction !== 'OUTFLOW') {
    return NextResponse.json({ error: 'Direction must be INFLOW or OUTFLOW' }, { status: 400 });
  }

  const amountNum = Number(amount);
  if (!amountNum || amountNum <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 });
  }

  // Ownership check on the head
  const { data: category } = await supabaseAdmin
    .from('expense_categories')
    .select('id, user_id')
    .eq('id', categoryId)
    .maybeSingle();

  if (!category || category.user_id !== userId) {
    return NextResponse.json({ error: 'Head not found' }, { status: 404 });
  }

  const { data: entry, error } = await supabaseAdmin
    .from('expense_entries')
    .insert({
      user_id: userId,
      category_id: categoryId,
      direction,
      date,
      amount: Math.round(amountNum * 100) / 100,
      notes: notes || null,
    })
    .select('*, category:expense_categories(*)')
    .single();

  if (error || !entry) {
    console.error('Failed to create expense entry:', error);
    return NextResponse.json({ error: 'Failed to save entry' }, { status: 500 });
  }

  return NextResponse.json({ entry });
}
