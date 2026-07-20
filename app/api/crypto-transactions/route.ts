import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { holdingId, type, date, quantity, price, notes } = body;

  if (!holdingId || !type || !date || !quantity || !price) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (type !== 'BUY' && type !== 'SELL') {
    return NextResponse.json({ error: 'Type must be BUY or SELL' }, { status: 400 });
  }

  const quantityNum = Number(quantity);
  const priceNum = Number(price);

  if (quantityNum <= 0 || priceNum <= 0) {
    return NextResponse.json({ error: 'Quantity and price must be positive' }, { status: 400 });
  }

  // Ownership check
  const { data: holding } = await supabaseAdmin
    .from('crypto_holdings')
    .select('id, user_id')
    .eq('id', holdingId)
    .maybeSingle();

  if (!holding || holding.user_id !== userId) {
    return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
  }

  // For a SELL, make sure there's actually enough quantity held — same
  // guard as the stock side, so an over-sell can't silently drive
  // totalQuantity negative.
  if (type === 'SELL') {
    const { data: existingTxns, error: txnFetchErr } = await supabaseAdmin
      .from('crypto_transactions')
      .select('type, quantity')
      .eq('holding_id', holdingId);

    if (txnFetchErr) {
      console.error('Failed to fetch existing crypto transactions:', txnFetchErr);
      return NextResponse.json({ error: 'Could not verify available quantity' }, { status: 500 });
    }

    const heldQuantity = (existingTxns ?? []).reduce(
      (sum, t) => sum + (t.type === 'BUY' ? Number(t.quantity) : -Number(t.quantity)),
      0
    );

    const EPSILON = 0.00000001;
    if (quantityNum > heldQuantity + EPSILON) {
      return NextResponse.json(
        {
          error:
            heldQuantity > EPSILON
              ? `You only hold ${heldQuantity.toFixed(8)} — cannot sell ${quantityNum.toFixed(8)}.`
              : 'You hold none of this coin to sell.',
        },
        { status: 400 }
      );
    }
  }

  const amount = Math.round(quantityNum * priceNum * 100) / 100;

  const { data: transaction, error } = await supabaseAdmin
    .from('crypto_transactions')
    .insert({
      holding_id: holdingId,
      type,
      date,
      quantity: quantityNum,
      price: priceNum,
      amount,
      notes: notes ?? null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Failed to create crypto transaction:', error);
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
  }

  return NextResponse.json({ transaction });
}
