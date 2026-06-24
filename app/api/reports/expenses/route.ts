import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { ExpenseEntry, ExpenseCategory } from '@/types';

// Reporting endpoint — returns every expense entry for the user (optionally
// bounded by a start/end date), unlike /api/expense-entries which is locked
// to a single calendar month. Powers the Reports → Expense Transactions tab,
// where "consolidated" means no date bound at all.
// Reporting endpoint — returns every expense entry for the user (optionally
// bounded by a start/end date), unlike /api/expense-entries which is locked
// to a single calendar month. Powers the Reports → Expense Transactions tab,
// where "consolidated" means no date bound at all.
//
// IMPORTANT: Supabase/PostgREST caps each individual request at 1000 rows
// (the project's "max rows" setting) no matter how large a single .range()
// you ask for — a single .range(0, 49999) call silently gets truncated to
// the first 1000 rows server-side. Since rows are ordered oldest-first, a
// user with >1000 historical entries would never see anything from later
// years (their newest data) at all. We page through in chunks of 1000 and
// concatenate until a page comes back short, which is the only way to get
// the *entire* history back from PostgREST.
const PAGE_SIZE = 1000;

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = req.nextUrl.searchParams.get('start'); // YYYY-MM-DD, optional
  const end = req.nextUrl.searchParams.get('end'); // YYYY-MM-DD, optional

  function buildQuery(from: number, to: number) {
    let q = supabaseAdmin
      .from('expense_entries')
      .select('*, category:expense_categories(*)')
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })
      .range(from, to);

    if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) {
      q = q.gte('date', start);
    }
    if (end && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
      q = q.lte('date', end);
    }
    return q;
  }

  const entries: ExpenseEntry[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error('Failed to fetch expense entries for report:', error);
      return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
    }
    const page = (data ?? []) as unknown as ExpenseEntry[];
    entries.push(...page);
    if (page.length < PAGE_SIZE) break; // last page
    from += PAGE_SIZE;
    if (from > 200000) break; // sane upper bound against an unexpected infinite loop
  }

  const categoriesRes = await supabaseAdmin
    .from('expense_categories')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true });

  if (categoriesRes.error) {
    console.error('Failed to fetch expense categories for report:', categoriesRes.error);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }

  const categories = (categoriesRes.data ?? []) as ExpenseCategory[];

  return NextResponse.json({ entries, categories });
}
