import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { LoanTenureUnit, LoanType } from '@/types';
import { calcInterestRate, calcEmiFromRate, calcInterestOnlyPayment } from '@/lib/loanMath';

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
  const { name, principal, tenure_value, tenure_unit, emi_start_date, loan_type } = body;

  const loanType: LoanType = (loan_type ?? existing.loan_type) === 'flexi' ? 'flexi' : 'standard';

  const principalNum = principal != null ? Number(principal) : existing.principal;
  const tenureNum = tenure_value != null ? Number(tenure_value) : existing.tenure_value;
  const unit: LoanTenureUnit = tenure_unit ?? existing.tenure_unit;
  const totalMonths = unit === 'years' ? tenureNum * 12 : tenureNum;

  let emiNum: number;
  let interestRate: number;
  let interestOnlyValue = 0;
  let interestOnlyUnit: LoanTenureUnit = 'years';
  let interestOnlyMonths = 0;
  let interestOnlyPayment = 0;

  if (loanType === 'flexi') {
    const rateNum =
      body.interest_rate != null ? Number(body.interest_rate) : existing.interest_rate;
    if (!rateNum || rateNum <= 0) {
      return NextResponse.json(
        { error: 'Interest rate must be positive for a flexi loan' },
        { status: 400 }
      );
    }
    interestOnlyUnit =
      (body.interest_only_unit ?? existing.interest_only_unit) as LoanTenureUnit;
    if (!['months', 'years'].includes(interestOnlyUnit)) {
      return NextResponse.json({ error: 'Invalid interest-only unit' }, { status: 400 });
    }
    interestOnlyValue =
      body.interest_only_value != null
        ? Number(body.interest_only_value)
        : existing.interest_only_value;
    if (!(interestOnlyValue >= 0)) {
      return NextResponse.json({ error: 'Interest-only period must be zero or positive' }, { status: 400 });
    }
    interestOnlyMonths =
      interestOnlyUnit === 'years' ? Math.round(interestOnlyValue * 12) : Math.round(interestOnlyValue);

    if (interestOnlyMonths >= totalMonths) {
      return NextResponse.json(
        { error: 'Interest-only period must be shorter than the total tenure' },
        { status: 400 }
      );
    }

    const amortizingMonths = totalMonths - interestOnlyMonths;
    interestRate = rateNum;
    emiNum = calcEmiFromRate(principalNum, rateNum, amortizingMonths);
    interestOnlyPayment = calcInterestOnlyPayment(principalNum, rateNum);
  } else {
    emiNum =
      body.emi_amount != null ? Number(body.emi_amount) : existing.emi_amount;
    if (emiNum <= 0) {
      return NextResponse.json({ error: 'Amounts and tenure must be positive' }, { status: 400 });
    }
    interestRate = calcInterestRate(principalNum, emiNum, totalMonths);
  }

  const updates: Record<string, unknown> = {
    name: (name ?? existing.name).trim(),
    loan_type: loanType,
    principal: Math.round(principalNum * 100) / 100,
    emi_amount: Math.round(emiNum * 100) / 100,
    tenure_value: tenureNum,
    tenure_unit: unit,
    emi_start_date: emi_start_date ?? existing.emi_start_date,
    total_months: totalMonths,
    interest_rate: interestRate,
    interest_only_value: interestOnlyValue,
    interest_only_unit: interestOnlyUnit,
    interest_only_months: interestOnlyMonths,
    interest_only_payment: interestOnlyPayment,
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
