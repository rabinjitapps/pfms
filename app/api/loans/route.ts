import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { Loan, LoanTenureUnit } from '@/types';

/**
 * Calculate annual interest rate (%) from principal, EMI, and total months
 * using the standard EMI formula: EMI = P * r * (1+r)^n / ((1+r)^n - 1)
 * We solve for r numerically via Newton-Raphson iteration.
 */
function calcInterestRate(principal: number, emi: number, totalMonths: number): number {
  if (emi * totalMonths <= principal) {
    // Zero-interest loan or bad inputs — just return 0
    return 0;
  }
  // Initial guess: monthly rate
  let r = 0.01;
  for (let i = 0; i < 100; i++) {
    const pow = Math.pow(1 + r, totalMonths);
    const f = (principal * r * pow) / (pow - 1) - emi;
    const df =
      (principal * pow * (1 + r * totalMonths - pow + r * totalMonths * (pow - 1))) /
      Math.pow(pow - 1, 2);
    const rNew = r - f / df;
    if (Math.abs(rNew - r) < 1e-10) {
      r = rNew;
      break;
    }
    r = rNew;
  }
  return Math.round(r * 12 * 10000) / 100; // annual % rounded to 2dp
}

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('loans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch loans:', error);
    return NextResponse.json({ error: 'Failed to fetch loans' }, { status: 500 });
  }

  return NextResponse.json({ loans: data ?? [] });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, principal, emi_amount, tenure_value, tenure_unit, emi_start_date } = body;

  if (!name || !principal || !emi_amount || !tenure_value || !tenure_unit || !emi_start_date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const principalNum = Number(principal);
  const emiNum = Number(emi_amount);
  const tenureNum = Number(tenure_value);

  if (principalNum <= 0 || emiNum <= 0 || tenureNum <= 0) {
    return NextResponse.json({ error: 'Amounts and tenure must be positive' }, { status: 400 });
  }

  if (!['months', 'years'].includes(tenure_unit)) {
    return NextResponse.json({ error: 'Invalid tenure unit' }, { status: 400 });
  }

  const totalMonths =
    (tenure_unit as LoanTenureUnit) === 'years' ? tenureNum * 12 : tenureNum;

  const interestRate = calcInterestRate(principalNum, emiNum, totalMonths);

  const { data: loan, error } = await supabaseAdmin
    .from('loans')
    .insert({
      user_id: userId,
      name: name.trim(),
      principal: Math.round(principalNum * 100) / 100,
      emi_amount: Math.round(emiNum * 100) / 100,
      tenure_value: tenureNum,
      tenure_unit,
      emi_start_date,
      total_months: totalMonths,
      interest_rate: interestRate,
    })
    .select('*')
    .single();

  if (error || !loan) {
    console.error('Failed to create loan:', error);
    return NextResponse.json({ error: 'Failed to save loan' }, { status: 500 });
  }

  return NextResponse.json({ loan });
}
