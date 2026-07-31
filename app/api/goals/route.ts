import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { buildGoalPortfolioSummary } from '@/lib/goals';
import { GoalContribution, GoalStatus } from '@/types';

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [goalsRes, contributionsRes] = await Promise.all([
    supabaseAdmin
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .order('target_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    // All contributions across every goal, fetched in one go — the explicit
    // range overrides Supabase's default 1000-row select() cap, same
    // reasoning as the bank-accounts and loans routes.
    supabaseAdmin
      .from('goal_contributions')
      .select('*')
      .eq('user_id', userId)
      .range(0, 9999),
  ]);

  if (goalsRes.error) {
    console.error('Failed to fetch goals:', goalsRes.error);
    return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 });
  }
  if (contributionsRes.error) {
    console.error('Failed to fetch goal contributions:', contributionsRes.error);
    return NextResponse.json({ error: 'Failed to fetch goal contributions' }, { status: 500 });
  }

  const goals = goalsRes.data ?? [];
  const contributions = (contributionsRes.data ?? []) as GoalContribution[];

  const contributionsByGoal: Record<string, GoalContribution[]> = {};
  for (const c of contributions) {
    if (!contributionsByGoal[c.goal_id]) contributionsByGoal[c.goal_id] = [];
    contributionsByGoal[c.goal_id].push(c);
  }

  const portfolio = buildGoalPortfolioSummary(goals, contributionsByGoal);

  return NextResponse.json({ portfolio });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, description, category, target_date, icon } = body;

  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: 'Goal name is required' }, { status: 400 });
  }

  const targetAmountNum = Number(body.target_amount);
  if (!targetAmountNum || targetAmountNum <= 0) {
    return NextResponse.json({ error: 'Target amount must be positive' }, { status: 400 });
  }

  const status: GoalStatus = ['active', 'completed', 'archived'].includes(body.status) ? body.status : 'active';

  const { data: goal, error } = await supabaseAdmin
    .from('goals')
    .insert({
      user_id: userId,
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      category: category ? String(category).trim() : null,
      target_amount: Math.round(targetAmountNum * 100) / 100,
      target_date: target_date || null,
      icon: icon ? String(icon).trim().slice(0, 8) : null,
      status,
    })
    .select('*')
    .single();

  if (error || !goal) {
    console.error('Failed to create goal:', error);
    return NextResponse.json({ error: 'Failed to save goal' }, { status: 500 });
  }

  return NextResponse.json({ goal });
}
