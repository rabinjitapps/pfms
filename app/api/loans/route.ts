import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { LoanTenureUnit, LoanType } from '@/types';
import { calcInterestRate, calcEmiFromRate, calcInterestOnlyPayment } from '@/lib/loanMath';

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

  const loans = data ?? [];
  const loanIds = loans.map((l) => l.id);

  if (loanIds.length > 0) {
    const { data: payments, error: paymentsError } = await supabaseAdmin
      .from('loan_payments')
      .select('loan_id, month, paid_at')
      .in('loan_id', loanIds);

    if (paymentsError) {
      console.error('Failed to fetch loan payments:', paymentsError);
    } else {
      const byLoan: Record<string, { loan_id: string; month: string; paid_at: string }[]> = {};
      for (const p of payments ?? []) {
        if (!byLoan[p.loan_id]) byLoan[p.loan_id] = [];
        byLoan[p.loan_id].push(p);
      }
      for (const loan of loans) {
        loan.payments = byLoan[loan.id] ?? [];
      }
    }
  }

  return NextResponse.json({ loans });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    name,
    principal,
    tenure_value,
    tenure_unit,
    emi_start_date,
    loan_type,
  } = body;

  const loanType: LoanType = loan_type === 'flexi' ? 'flexi' : 'standard';

  if (!name || !principal || !tenure_value || !tenure_unit || !emi_start_date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  // emi_amount is only required up-front for standard loans; flexi loans
  // derive it from the interest rate instead.
  if (loanType === 'standard' && !body.emi_amount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const principalNum = Number(principal);
  const tenureNum = Number(tenure_value);

  if (principalNum <= 0 || tenureNum <= 0) {
    return NextResponse.json({ error: 'Amounts and tenure must be positive' }, { status: 400 });
  }

  if (!['months', 'years'].includes(tenure_unit)) {
    return NextResponse.json({ error: 'Invalid tenure unit' }, { status: 400 });
  }

  const totalMonths =
    (tenure_unit as LoanTenureUnit) === 'years' ? tenureNum * 12 : tenureNum;

  let emiNum: number;
  let interestRate: number;
  let interestOnlyValue = 0;
  let interestOnlyUnit: LoanTenureUnit = 'years';
  let interestOnlyMonths = 0;
  let interestOnlyPayment = 0;

  if (loanType === 'flexi') {
    const rateNum = Number(body.interest_rate);
    if (!rateNum || rateNum <= 0) {
      return NextResponse.json(
        { error: 'Interest rate must be positive for a flexi loan' },
        { status: 400 }
      );
    }
    if (!['months', 'years'].includes(body.interest_only_unit)) {
      return NextResponse.json({ error: 'Invalid interest-only unit' }, { status: 400 });
    }
    interestOnlyUnit = body.interest_only_unit as LoanTenureUnit;
    interestOnlyValue = Number(body.interest_only_value);
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
    emiNum = Number(body.emi_amount);
    if (emiNum <= 0) {
      return NextResponse.json({ error: 'Amounts and tenure must be positive' }, { status: 400 });
    }
    interestRate = calcInterestRate(principalNum, emiNum, totalMonths);
  }

  const { data: loan, error } = await supabaseAdmin
    .from('loans')
    .insert({
      user_id: userId,
      name: name.trim(),
      loan_type: loanType,
      principal: Math.round(principalNum * 100) / 100,
      emi_amount: Math.round(emiNum * 100) / 100,
      tenure_value: tenureNum,
      tenure_unit,
      emi_start_date,
      total_months: totalMonths,
      interest_rate: interestRate,
      interest_only_value: interestOnlyValue,
      interest_only_unit: interestOnlyUnit,
      interest_only_months: interestOnlyMonths,
      interest_only_payment: interestOnlyPayment,
    })
    .select('*')
    .single();

  if (error || !loan) {
    console.error('Failed to create loan:', error);
    return NextResponse.json({ error: 'Failed to save loan' }, { status: 500 });
  }

  return NextResponse.json({ loan });
}
