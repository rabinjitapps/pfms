import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

async function assertOwnership(loanId: string, userId: string) {
  const { data: loan } = await supabaseAdmin
    .from('loans')
    .select('id, user_id')
    .eq('id', loanId)
    .maybeSingle();
  return !!loan && loan.user_id === userId;
}

// Mark a month as manually paid
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!(await assertOwnership(id, userId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json();
  const month = body?.month;
  if (typeof month !== 'string' || !MONTH_RE.test(month)) {
    return NextResponse.json({ error: 'Invalid or missing month (expected YYYY-MM)' }, { status: 400 });
  }

  const { data: payment, error } = await supabaseAdmin
    .from('loan_payments')
    .upsert(
      { loan_id: id, user_id: userId, month, paid_at: new Date().toISOString() },
      { onConflict: 'loan_id,month' }
    )
    .select('loan_id, month, paid_at')
    .single();

  if (error || !payment) {
    console.error('Failed to mark loan payment:', error);
    return NextResponse.json({ error: 'Failed to mark payment' }, { status: 500 });
  }

  return NextResponse.json({ payment });
}

// Unmark a manually-paid month
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!(await assertOwnership(id, userId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const month = req.nextUrl.searchParams.get('month');
  if (!month || !MONTH_RE.test(month)) {
    return NextResponse.json({ error: 'Invalid or missing month (expected YYYY-MM)' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('loan_payments')
    .delete()
    .eq('loan_id', id)
    .eq('month', month);

  if (error) {
    console.error('Failed to unmark loan payment:', error);
    return NextResponse.json({ error: 'Failed to unmark payment' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
