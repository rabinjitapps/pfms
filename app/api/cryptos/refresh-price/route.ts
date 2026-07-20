import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { fetchCryptoQuotes } from '@/lib/cryptoPrice';

export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get the distinct coins this user holds
  const { data: holdings, error: holdingsErr } = await supabaseAdmin
    .from('crypto_holdings')
    .select('crypto:cryptos(id, symbol)')
    .eq('user_id', userId);

  if (holdingsErr) {
    console.error('Failed to fetch crypto holdings for price refresh:', holdingsErr);
    return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500 });
  }

  const cryptos = (holdings ?? [])
    .map((h) => h.crypto as unknown as { id: string; symbol: string })
    .filter((c) => c && c.symbol);

  if (cryptos.length === 0) {
    return NextResponse.json({ updated: 0, total: 0, message: 'No cryptos to update' });
  }

  let quotes;
  try {
    quotes = await fetchCryptoQuotes(cryptos.map((c) => c.symbol));
  } catch (err) {
    console.error('Yahoo Finance fetch failed:', err);
    return NextResponse.json({ error: 'Failed to reach Yahoo Finance' }, { status: 502 });
  }

  let updated = 0;
  for (const crypto of cryptos) {
    const quote = quotes.get(crypto.symbol);
    if (!quote) continue;

    await supabaseAdmin
      .from('cryptos')
      .update({
        latest_price: quote.price,
        latest_price_date: quote.date,
        updated_at: new Date().toISOString(),
      })
      .eq('id', crypto.id);

    await supabaseAdmin
      .from('crypto_price_history')
      .upsert({ crypto_id: crypto.id, date: quote.date, price: quote.price }, { onConflict: 'crypto_id,date' });

    updated += 1;
  }

  return NextResponse.json({ updated, total: cryptos.length });
}
