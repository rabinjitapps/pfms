import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { ExpenseEntry, ExpenseCategory } from '@/types';

// Reporting endpoint — returns every expense entry for the user (optionally
// bounded by a start/end date), unlike /api/expense-entries which is locked
// to a single calendar month. Powers the Reports → Expense Transactions tab,
// where "consolidated" means no date bound at all.
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = req.nextUrl.searchParams.get('start'); // YYYY-MM-DD, optional
  const end = req.nextUrl.searchParams.get('end'); // YYYY-MM-DD, optional

  let query = supabaseAdmin
    .from('expense_entries')
    .select('*, category:expense_categories(*)')
    .eq('user_id', userId)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true })
    // Explicit range override so a long reporting history (multi-year,
    // consolidated) isn't silently truncated at Supabase's default 1000-row cap.
    .range(0, 49999);

  if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) {
    query = query.gte('date', start);
  }
  if (end && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
    query = query.lte('date', end);
  }

  const [entriesRes, categoriesRes] = await Promise.all([
    query,
    supabaseAdmin
      .from('expense_categories')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true }),
  ]);

  if (entriesRes.error) {
    console.error('Failed to fetch expense entries for report:', entriesRes.error);
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
  }
  if (categoriesRes.error) {
    console.error('Failed to fetch expense categories for report:', categoriesRes.error);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }

  const entries = (entriesRes.data ?? []) as unknown as ExpenseEntry[];
  const categories = (categoriesRes.data ?? []) as ExpenseCategory[];

  return NextResponse.json({ entries, categories });
}
