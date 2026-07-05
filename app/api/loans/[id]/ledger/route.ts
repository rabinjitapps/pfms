import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { calcOpenLoanMonthlyInterest } from '@/lib/loanMath';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

async function getOwnedOpenLoan(loanId: string, userId: string) {
  const { data: loan } = await supabaseAdmin
    .from('loans')
    .select('*')
    .eq('id', loanId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!loan || loan.loan_type !== 'open') return null;
  return loan;
}

// Record a new month's payment against an open loan, updating its running
// outstanding_principal in the same request.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const loan = await getOwnedOpenLoan(id, userId);
  if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const entryDate: string = body?.entry_date || new Date().toISOString().slice(0, 10);
  const month: string = body?.month || entryDate.slice(0, 7);
  const entryType = body?.entry_type === 'payment' ? 'payment' : 'interest_only';

  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ error: 'Invalid month (expected YYYY-MM)' }, { status: 400 });
  }

  const balanceBefore = Number(loan.outstanding_principal ?? loan.principal);
  const interestDue = calcOpenLoanMonthlyInterest(balanceBefore, loan.interest_rate);

  let amount: number;
  let interestComponent: number;
  let principalComponent: number;
  let balanceAfter: number;

  if (entryType === 'interest_only') {
    if (balanceBefore <= 0) {
      return NextResponse.json({ error: 'This loan is already fully repaid' }, { status: 400 });
    }
    amount = interestDue;
    interestComponent = interestDue;
    principalComponent = 0;
    balanceAfter = balanceBefore;
  } else {
    amount = Number(body?.amount);
    if (!(amount > 0)) {
      return NextResponse.json({ error: 'Payment amount must be positive' }, { status: 400 });
    }
    interestComponent = Math.round(Math.min(amount, interestDue) * 100) / 100;
    principalComponent = Math.round(Math.max(0, amount - interestDue) * 100) / 100;
    // Don't let a single payment overshoot the remaining balance.
    principalComponent = Math.min(principalComponent, balanceBefore);
    balanceAfter = Math.round((balanceBefore - principalComponent) * 100) / 100;
  }

  const { data: entry, error: entryError } = await supabaseAdmin
    .from('loan_ledger_entries')
    .insert({
      loan_id: id,
      entry_date: entryDate,
      month,
      entry_type: entryType,
      amount: Math.round(amount * 100) / 100,
      interest_component: interestComponent,
      principal_component: principalComponent,
      balance_after: balanceAfter,
    })
    .select('*')
    .single();

  if (entryError || !entry) {
    console.error('Failed to record loan ledger entry:', entryError);
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
  }

  const { data: updatedLoan, error: loanError } = await supabaseAdmin
    .from('loans')
    .update({ outstanding_principal: balanceAfter, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (loanError || !updatedLoan) {
    console.error('Failed to update loan balance:', loanError);
    return NextResponse.json({ error: 'Failed to update loan balance' }, { status: 500 });
  }

  return NextResponse.json({ entry, loan: updatedLoan });
}

// Delete a ledger entry (e.g. undo a mis-recorded payment) and replay the
// remaining entries in date order to recompute outstanding_principal —
// safer than trying to arithmetically reverse just the one entry, since
// entries recorded out of order could otherwise leave the balance wrong.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const loan = await getOwnedOpenLoan(id, userId);
  if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const entryId = req.nextUrl.searchParams.get('entry_id');
  if (!entryId) {
    return NextResponse.json({ error: 'Missing entry_id' }, { status: 400 });
  }

  const { error: deleteError } = await supabaseAdmin
    .from('loan_ledger_entries')
    .delete()
    .eq('id', entryId)
    .eq('loan_id', id);

  if (deleteError) {
    console.error('Failed to delete loan ledger entry:', deleteError);
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 });
  }

  const { data: remaining, error: fetchError } = await supabaseAdmin
    .from('loan_ledger_entries')
    .select('*')
    .eq('loan_id', id)
    .order('entry_date', { ascending: true });

  if (fetchError) {
    console.error('Failed to reload loan ledger:', fetchError);
    return NextResponse.json({ error: 'Failed to recompute balance' }, { status: 500 });
  }

  // Replay from the original principal, re-deriving each entry's
  // principal_component against the balance at that point in the sequence.
  let balance = Number(loan.principal);
  for (const e of remaining ?? []) {
    const interestDue = calcOpenLoanMonthlyInterest(balance, loan.interest_rate);
    let principalComponent = 0;
    let interestComponent = 0;
    if (e.entry_type === 'interest_only') {
      interestComponent = interestDue;
    } else {
      interestComponent = Math.round(Math.min(e.amount, interestDue) * 100) / 100;
      principalComponent = Math.min(Math.round(Math.max(0, e.amount - interestDue) * 100) / 100, balance);
    }
    balance = Math.round((balance - principalComponent) * 100) / 100;

    await supabaseAdmin
      .from('loan_ledger_entries')
      .update({
        interest_component: interestComponent,
        principal_component: principalComponent,
        balance_after: balance,
      })
      .eq('id', e.id);
  }

  const { data: updatedLoan, error: loanError } = await supabaseAdmin
    .from('loans')
    .update({ outstanding_principal: balance, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (loanError || !updatedLoan) {
    console.error('Failed to update loan balance:', loanError);
    return NextResponse.json({ error: 'Failed to update loan balance' }, { status: 500 });
  }

  return NextResponse.json({ loan: updatedLoan });
}
