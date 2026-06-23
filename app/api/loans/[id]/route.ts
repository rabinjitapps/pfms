import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { LoanTenureUnit } from '@/types';

function calcInterestRate(principal: number, emi: number, totalMonths: number): number {
  if (emi * totalMonths <= principal) return 0;
  let r = 0.01;
  for (let i = 0; i < 100; i++) {
    const pow = Math.pow(1 + r, totalMonths);
    const f = (principal * r * pow) / (pow - 1) - emi;
    const df =
      (principal * pow * (1 + r * totalMonths - pow + r * totalMonths * (pow - 1))) /
      Math.pow(pow - 1, 2);
    const rNew = r - f / df;
    if (Math.abs(rNew - r) < 1e-10) { r = rNew; break; }
    r = rNew;
  }
  return Math.round(r * 12 * 10000) / 100;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Ownership check
  const { data: loan } = await supabaseAdmin
    .from('loans')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!loan || loan.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from('loans').delete().eq('id', id);
  if (error) {
    console.error('Failed to delete loan:', error);
    return NextResponse.json({ error: 'Failed to delete loan' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: existing } = await supabaseAdmin
    .from('loans')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { name, principal, emi_amount, tenure_value, tenure_unit, emi_start_date } = body;

  const principalNum = principal != null ? Number(principal) : existing.principal;
  const emiNum = emi_amount != null ? Number(emi_amount) : existing.emi_amount;
  const tenureNum = tenure_value != null ? Number(tenure_value) : existing.tenure_value;
  const unit: LoanTenureUnit =
    tenure_unit ?? existing.tenure_unit;
  const totalMonths = unit === 'years' ? tenureNum * 12 : tenureNum;
  const interestRate = calcInterestRate(principalNum, emiNum, totalMonths);

  const updates: Record<string, unknown> = {
    name: (name ?? existing.name).trim(),
    principal: Math.round(principalNum * 100) / 100,
    emi_amount: Math.round(emiNum * 100) / 100,
    tenure_value: tenureNum,
    tenure_unit: unit,
    emi_start_date: emi_start_date ?? existing.emi_start_date,
    total_months: totalMonths,
    interest_rate: interestRate,
    updated_at: new Date().toISOString(),
  };

  const { data: loan, error } = await supabaseAdmin
    .from('loans')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !loan) {
    console.error('Failed to update loan:', error);
    return NextResponse.json({ error: 'Failed to update loan' }, { status: 500 });
  }

  return NextResponse.json({ loan });
}
