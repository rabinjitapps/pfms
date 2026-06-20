import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('expense_categories')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to fetch expense categories:', error);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }

  return NextResponse.json({ categories: data ?? [] });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { name, kind } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Head name is required' }, { status: 400 });
  }
  if (kind !== 'INCOME' && kind !== 'EXPENSE') {
    return NextResponse.json({ error: 'Kind must be INCOME or EXPENSE' }, { status: 400 });
  }

  const trimmedName = name.trim();

  // Reuse an existing head with the same name + kind rather than erroring,
  // so the "create on the fly" flow in the entry modal is idempotent.
  const { data: existing } = await supabaseAdmin
    .from('expense_categories')
    .select('*')
    .eq('user_id', userId)
    .eq('kind', kind)
    .ilike('name', trimmedName)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ category: existing, alreadyExists: true });
  }

  const { data: created, error } = await supabaseAdmin
    .from('expense_categories')
    .insert({ user_id: userId, name: trimmedName, kind })
    .select('*')
    .single();

  if (error || !created) {
    console.error('Failed to create expense category:', error);
    return NextResponse.json({ error: 'Failed to create head' }, { status: 500 });
  }

  return NextResponse.json({ category: created, alreadyExists: false });
}
