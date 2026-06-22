import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { fetchStockQuotes } from '@/lib/stockPrice';

export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get the distinct stocks this user holds
  const { data: holdings, error: holdingsErr } = await supabaseAdmin
    .from('stock_holdings')
    .select('stock:stocks(id, symbol)')
    .eq('user_id', userId);

  if (holdingsErr) {
    console.error('Failed to fetch stock holdings for price refresh:', holdingsErr);
    return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500 });
  }

  const stocks = (holdings ?? [])
    .map((h) => h.stock as unknown as { id: string; symbol: string })
    .filter((s) => s && s.symbol);

  if (stocks.length === 0) {
    return NextResponse.json({ updated: 0, total: 0, message: 'No stocks to update' });
  }

  let quotes;
  try {
    quotes = await fetchStockQuotes(stocks.map((s) => s.symbol));
  } catch (err) {
    console.error('Yahoo Finance fetch failed:', err);
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
