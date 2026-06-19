import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Look up the transaction directly first (no join — avoids any ambiguity
  // around how the Supabase client shapes nested/joined results).
  const { data: transaction, error: txnLookupErr } = await supabaseAdmin
    .from('transactions')
    .select('id, holding_id')
    .eq('id', id)
    .maybeSingle();

  if (txnLookupErr) {
    console.error('Failed to look up transaction for delete:', txnLookupErr);
    return NextResponse.json({ error: 'Failed to look up transaction' }, { status: 500 });
  }

  if (!transaction) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Then look up the owning holding separately to confirm it belongs to this user.
  const { data: holding, error: holdingLookupErr } = await supabaseAdmin
    .from('holdings')
    .select('id, user_id')
    .eq('id', transaction.holding_id)
    .maybeSingle();

  if (holdingLookupErr) {
    console.error('Failed to look up holding for delete:', holdingLookupErr);
    return NextResponse.json({ error: 'Failed to look up holding' }, { status: 500 });
  }

  if (!holding || holding.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from('transactions').delete().eq('id', id);

  if (error) {
    console.error('Failed to delete transaction:', error);
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}