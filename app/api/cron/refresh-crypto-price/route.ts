import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchCryptoQuotes } from '@/lib/cryptoPrice';

// Protect this route with a shared secret so only Vercel Cron (or you) can trigger it.
function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: cryptos, error: cryptosErr } = await supabaseAdmin
    .from('cryptos')
    .select('id, symbol');

  if (cryptosErr) {
    console.error('Failed to fetch cryptos for cron price refresh:', cryptosErr);
    return NextResponse.json({ error: 'Failed to fetch cryptos' }, { status: 500 });
  }

  if (!cryptos || cryptos.length === 0) {
    return NextResponse.json({ updated: 0, message: 'No cryptos in the system' });
  }

  let quotes;
  try {
    quotes = await fetchCryptoQuotes(cryptos.map((c) => c.symbol));
  } catch (err) {
    console.error('Yahoo Finance fetch failed in cron:', err);
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
