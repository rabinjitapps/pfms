import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { GoalStatus } from '@/types';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: existing } = await supabaseAdmin
    .from('goals')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { name, description, category, target_date, icon } = body;

  if (name != null && !String(name).trim()) {
    return NextResponse.json({ error: 'Goal name cannot be empty' }, { status: 400 });
  }

  const targetAmountNum = body.target_amount != null ? Number(body.target_amount) : existing.target_amount;
  if (!targetAmountNum || targetAmountNum <= 0) {
    return NextResponse.json({ error: 'Target amount must be positive' }, { status: 400 });
  }

  const status: GoalStatus =
    body.status !== undefined && ['active', 'completed', 'archived'].includes(body.status)
      ? body.status
      : existing.status;

  const updates: Record<string, unknown> = {
    name: name != null ? String(name).trim() : existing.name,
    description: description !== undefined ? (description ? String(description).trim() : null) : existing.description,
    category: category !== undefined ? (category ? String(category).trim() : null) : existing.category,
    target_amount: Math.round(targetAmountNum * 100) / 100,
    target_date: target_date !== undefined ? target_date || null : existing.target_date,
    icon: icon !== undefined ? (icon ? String(icon).trim().slice(0, 8) : null) : existing.icon,
    status,
    updated_at: new Date().toISOString(),
  };

  const { data: goal, error } = await supabaseAdmin
    .from('goals')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !goal) {
    console.error('Failed to update goal:', error);
    return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 });
  }

  return NextResponse.json({ goal });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: goal } = await supabaseAdmin
    .from('goals')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!goal || goal.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // goal_contributions references goals with ON DELETE CASCADE, so deleting
  // the goal also removes its full contribution history.
  const { error } = await supabaseAdmin.from('goals').delete().eq('id', id);
  if (error) {
    console.error('Failed to delete goal:', error);
    return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
