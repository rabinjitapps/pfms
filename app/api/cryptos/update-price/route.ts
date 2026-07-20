import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';

export async function PATCH(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { cryptoId, price, date } = body;

  if (!cryptoId || !price) {
    return NextResponse.json({ error: 'cryptoId and price are required' }, { status: 400 });
  }

  const priceNum = Number(price);
  if (priceNum <= 0) {
    return NextResponse.json({ error: 'Price must be positive' }, { status: 400 });
  }

  const priceDate = date || new Date().toISOString().slice(0, 10);

  const { error } = await supabaseAdmin
    .from('cryptos')
    .update({ latest_price: priceNum, latest_price_date: priceDate, updated_at: new Date().toISOString() })
    .eq('id', cryptoId);

  if (error) {
    console.error('Failed to update crypto price manually:', error);
    return NextResponse.json({ error: 'Failed to update price' }, { status: 500 });
  }

  await supabaseAdmin
    .from('crypto_price_history')
    .upsert({ crypto_id: cryptoId, date: priceDate, price: priceNum }, { onConflict: 'crypto_id,date' });

  return NextResponse.json({ success: true });
}
