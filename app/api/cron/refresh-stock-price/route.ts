import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchStockQuotes } from '@/lib/stockPrice';

// Protect this route with a shared secret so only Vercel Cron (or you) can trigger it.
function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: stocks, error: stocksErr } = await supabaseAdmin
    .from('stocks')
    .select('id, symbol');

  if (stocksErr) {
    console.error('Failed to fetch stocks for cron price refresh:', stocksErr);
    return NextResponse.json({ error: 'Failed to fetch stocks' }, { status: 500 });
  }

  if (!stocks || stocks.length === 0) {
    return NextResponse.json({ updated: 0, message: 'No stocks in the system' });
  }

  let quotes;
  try {
    quotes = await fetchStockQuotes(stocks.map((s) => s.symbol));
  } catch (err) {
    console.error('Yahoo Finance fetch failed in cron:', err);
    return NextResponse.json({ error: 'Failed to reach Yahoo Finance' }, { status: 502 });
  }

  let updated = 0;
  for (const stock of stocks) {
    const quote = quotes.get(stock.symbol);
    if (!quote) continue;

    await supabaseAdmin
      .from('stocks')
      .update({
        latest_price: quote.price,
        latest_price_date: quote.date,
        updated_at: new Date().toISOString(),
      })
      .eq('id', stock.id);

    await supabaseAdmin
      .from('stock_price_history')
      .upsert({ stock_id: stock.id, date: quote.date, price: quote.price }, { onConflict: 'stock_id,date' });

    updated += 1;
  }

  return NextResponse.json({ updated, total: stocks.length });
}
