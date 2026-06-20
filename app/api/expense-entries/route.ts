import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { ExpenseEntry, ExpenseSummary } from '@/types';

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [categoriesRes, entriesRes] = await Promise.all([
    supabaseAdmin
      .from('expense_categories')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('expense_entries')
      .select('*, category:expense_categories(*)')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
  ]);

  if (categoriesRes.error) {
    console.error('Failed to fetch expense categories:', categoriesRes.error);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }
  if (entriesRes.error) {
    console.error('Failed to fetch expense entries:', entriesRes.error);
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
  }

  const entries = (entriesRes.data ?? []) as unknown as ExpenseEntry[];

  const totalInflow = entries
    .filter((e) => e.direction === 'INFLOW')
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const totalOutflow = entries
    .filter((e) => e.direction === 'OUTFLOW')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const summary: ExpenseSummary = {
    totalInflow,
    totalOutflow,
    net: totalInflow - totalOutflow,
    categories: categoriesRes.data ?? [],
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
