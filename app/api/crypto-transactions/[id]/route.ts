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
    .from('crypto_transactions')
    .select('id, holding_id')
    .eq('id', id)
    .maybeSingle();

  if (txnLookupErr) {
    console.error('Failed to look up crypto transaction for delete:', txnLookupErr);
    return NextResponse.json({ error: 'Failed to look up transaction' }, { status: 500 });
  }

  if (!transaction) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Then look up the owning holding separately to confirm it belongs to this user.
  const { data: holding, error: holdingLookupErr } = await supabaseAdmin
    .from('crypto_holdings')
    .select('id, user_id')
    .eq('id', transaction.holding_id)
    .maybeSingle();

  if (holdingLookupErr) {
    console.error('Failed to look up crypto holding for delete:', holdingLookupErr);
    return NextResponse.json({ error: 'Failed to look up holding' }, { status: 500 });
  }

  if (!holding || holding.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // If this is a BUY, make sure removing it wouldn't drive total quantity
  // negative — i.e. a later SELL already depends on this quantity.
  const { data: allTxns, error: allTxnsErr } = await supabaseAdmin
    .from('crypto_transactions')
    .select('id, type, quantity')
    .eq('holding_id', transaction.holding_id);

  if (allTxnsErr) {
    console.error('Failed to fetch crypto transactions for delete check:', allTxnsErr);
    return NextResponse.json({ error: 'Could not verify this deletion' }, { status: 500 });
  }

  const remaining = (allTxns ?? []).filter((t) => t.id !== id);
  const resultingQuantity = remaining.reduce(
    (sum, t) => sum + (t.type === 'BUY' ? Number(t.quantity) : -Number(t.quantity)),
    0
  );

  const EPSILON = 0.00000001;
  if (resultingQuantity < -EPSILON) {
    return NextResponse.json(
      {
        error:
          'Deleting this would leave a SELL with no matching quantity — delete the later SELL transaction first.',
      },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin.from('crypto_transactions').delete().eq('id', id);

  if (error) {
    console.error('Failed to delete crypto transaction:', error);
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
