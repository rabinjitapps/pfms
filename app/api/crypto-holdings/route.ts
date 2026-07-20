import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { CryptoHolding, CryptoHoldingSummary, CryptoPortfolioSummary } from '@/types';

function summarize(holding: CryptoHolding): CryptoHoldingSummary {
  const buys = holding.transactions.filter((t) => t.type === 'BUY');
  const sells = holding.transactions.filter((t) => t.type === 'SELL');

  const buyQty = buys.reduce((sum, t) => sum + Number(t.quantity), 0);
  const sellQty = sells.reduce((sum, t) => sum + Number(t.quantity), 0);
  const totalQuantity = buyQty - sellQty;

  const buyAmount = buys.reduce((sum, t) => sum + Number(t.amount), 0);

  // Invested amount = cost basis still held (simple average-cost method),
  // same convention as the stock side.
  const avgPrice = buyQty > 0 ? buyAmount / buyQty : 0;
  const investedAmount = totalQuantity * avgPrice;

  const currentPrice = Number(holding.crypto.latest_price ?? 0);
  const currentValue = totalQuantity * currentPrice;
  const gainLoss = currentValue - investedAmount;
  const gainLossPct = investedAmount > 0 ? (gainLoss / investedAmount) * 100 : 0;

  return {
    id: holding.id,
    crypto: holding.crypto,
    totalQuantity,
    investedAmount,
    avgPrice,
    currentValue,
    gainLoss,
    gainLossPct,
    transactions: holding.transactions,
  };
}

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('crypto_holdings')
    .select('id, user_id, crypto_id, created_at, crypto:cryptos(*), transactions:crypto_transactions(*)')
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to fetch crypto holdings:', error);
    return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500 });
  }

  const holdings = (data ?? []) as unknown as CryptoHolding[];
  const summaries = holdings
    .map(summarize)
    // Same convention as funds/stocks: only hide holdings that are
    // genuinely closed out. Negative quantity signals a data problem and
    // should stay visible rather than silently disappearing.
    .filter((h) => Math.abs(h.totalQuantity) > 0.00000001 || h.transactions.length === 0)
    .sort((a, b) => b.currentValue - a.currentValue);

  const totalInvested = summaries.reduce((sum, h) => sum + h.investedAmount, 0);
  const currentValue = summaries.reduce((sum, h) => sum + h.currentValue, 0);
  const totalGainLoss = currentValue - totalInvested;
  const totalGainLossPct = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;

  const portfolio: CryptoPortfolioSummary = {
    totalInvested,
    currentValue,
    totalGainLoss,
    totalGainLossPct,
    holdings: summaries,
  };

  return NextResponse.json(portfolio);
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { symbol, name, exchange, initialPrice } = body;

  if (!symbol || !name) {
    return NextResponse.json({ error: 'symbol and name are required' }, { status: 400 });
  }

  const normalizedSymbol = String(symbol).trim().toUpperCase();

  // Find existing crypto by symbol, or create it
  const { data: existing } = await supabaseAdmin
    .from('cryptos')
    .select('id')
    .eq('symbol', normalizedSymbol)
    .maybeSingle();

  let cryptoId: string;

  if (existing) {
    cryptoId = existing.id;
  } else {
    const { data: created, error: createErr } = await supabaseAdmin
      .from('cryptos')
      .insert({
        symbol: normalizedSymbol,
        name,
        exchange: exchange ?? null,
        latest_price: initialPrice ?? null,
        latest_price_date: initialPrice ? new Date().toISOString().slice(0, 10) : null,
      })
      .select('id')
      .single();

    if (createErr || !created) {
      console.error('Failed to create crypto:', createErr);
      return NextResponse.json({ error: 'Failed to create crypto' }, { status: 500 });
    }
    cryptoId = created.id;
  }

  // Find or create the holding for this user + crypto
  const { data: existingHolding } = await supabaseAdmin
    .from('crypto_holdings')
    .select('id')
    .eq('user_id', userId)
    .eq('crypto_id', cryptoId)
    .maybeSingle();

  if (existingHolding) {
    return NextResponse.json({ holdingId: existingHolding.id, cryptoId, alreadyExists: true });
  }

  const { data: holding, error: holdingErr } = await supabaseAdmin
    .from('crypto_holdings')
    .insert({ user_id: userId, crypto_id: cryptoId })
    .select('id')
    .single();

  if (holdingErr || !holding) {
    console.error('Failed to create crypto holding:', holdingErr);
    return NextResponse.json({ error: 'Failed to create holding' }, { status: 500 });
  }

  return NextResponse.json({ holdingId: holding.id, cryptoId, alreadyExists: false });
}
