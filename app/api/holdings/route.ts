import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { Holding, HoldingSummary, PortfolioSummary } from '@/types';

function summarize(holding: Holding): HoldingSummary {
  const buys = holding.transactions.filter((t) => t.type === 'BUY');
  const sells = holding.transactions.filter((t) => t.type === 'SELL');

  const buyUnits = buys.reduce((sum, t) => sum + Number(t.units), 0);
  const sellUnits = sells.reduce((sum, t) => sum + Number(t.units), 0);
  const totalUnits = buyUnits - sellUnits;

  const buyAmount = buys.reduce((sum, t) => sum + Number(t.amount), 0);
  const sellAmount = sells.reduce((sum, t) => sum + Number(t.amount), 0);

  // Invested amount = cost basis still held (simple average-cost method)
  const avgNav = buyUnits > 0 ? buyAmount / buyUnits : 0;
  const investedAmount = totalUnits * avgNav;

  const currentNav = Number(holding.fund.latest_nav ?? 0);
  const currentValue = totalUnits * currentNav;
  const gainLoss = currentValue - investedAmount;
  const gainLossPct = investedAmount > 0 ? (gainLoss / investedAmount) * 100 : 0;

  return {
    id: holding.id,
    fund: holding.fund,
    totalUnits,
    investedAmount,
    avgNav,
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
    .from('holdings')
    .select('id, user_id, fund_id, created_at, fund:funds(*), transactions(*)')
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to fetch holdings:', error);
    return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500 });
  }

  const holdings = (data ?? []) as unknown as Holding[];
  // const summaries = holdings
  //   .map(summarize)
  //   // Only hide holdings that are genuinely closed out (units net to ~0).
  //   // Negative units mean a data problem (e.g. a sell that exceeded what
  //   // was held) and should stay visible so it can be spotted and fixed,
  //   // rather than silently disappearing from the list.
  //   .filter((h) => Math.abs(h.totalUnits) > 0.0001 || h.transactions.length === 0)
  //   .sort((a, b) => b.currentValue - a.currentValue);

  const summaries = holdings
  .map(summarize)
  .sort((a, b) => b.currentValue - a.currentValue);

  const totalInvested = summaries.reduce((sum, h) => sum + h.investedAmount, 0);
  const currentValue = summaries.reduce((sum, h) => sum + h.currentValue, 0);
  const totalGainLoss = currentValue - totalInvested;
  const totalGainLossPct = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;

  const portfolio: PortfolioSummary = {
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
  const { schemeCode, schemeName, manualName, category, fundHouse, initialNav } = body;

  if (!schemeCode && !manualName) {
    return NextResponse.json({ error: 'Either schemeCode or manualName is required' }, { status: 400 });
  }

  let fundId: string;

  // Find existing fund by scheme code, or create it
  if (schemeCode) {
    const { data: existing } = await supabaseAdmin
      .from('funds')
      .select('id')
      .eq('scheme_code', schemeCode)
      .maybeSingle();

    if (existing) {
      fundId = existing.id;
    } else {
      const { data: created, error: createErr } = await supabaseAdmin
        .from('funds')
        .insert({
          scheme_code: schemeCode,
          name: schemeName,
          fund_house: fundHouse ?? null,
          category: category ?? null,
          latest_nav: initialNav ?? null,
          latest_nav_date: initialNav ? new Date().toISOString().slice(0, 10) : null,
        })
        .select('id')
        .single();

      if (createErr || !created) {
        console.error('Failed to create fund:', createErr);
        return NextResponse.json({ error: 'Failed to create fund' }, { status: 500 });
      }
      fundId = created.id;
    }
  } else {
    // Manual fund, no AMFI scheme code — name must be unique enough; just create a new row.
    const { data: created, error: createErr } = await supabaseAdmin
      .from('funds')
      .insert({
        scheme_code: null,
        name: manualName,
        fund_house: fundHouse ?? null,
        category: category ?? null,
        latest_nav: initialNav ?? null,
        latest_nav_date: initialNav ? new Date().toISOString().slice(0, 10) : null,
      })
      .select('id')
      .single();

    if (createErr || !created) {
      console.error('Failed to create manual fund:', createErr);
      return NextResponse.json({ error: 'Failed to create fund' }, { status: 500 });
    }
    fundId = created.id;
  }

  // Find or create the holding for this user + fund
  const { data: existingHolding } = await supabaseAdmin
    .from('holdings')
    .select('id')
    .eq('user_id', userId)
    .eq('fund_id', fundId)
    .maybeSingle();

  if (existingHolding) {
    return NextResponse.json({ holdingId: existingHolding.id, fundId, alreadyExists: true });
  }

  const { data: holding, error: holdingErr } = await supabaseAdmin
    .from('holdings')
    .insert({ user_id: userId, fund_id: fundId })
    .select('id')
    .single();

  if (holdingErr || !holding) {
    console.error('Failed to create holding:', holdingErr);
    return NextResponse.json({ error: 'Failed to create holding' }, { status: 500 });
  }

  return NextResponse.json({ holdingId: holding.id, fundId, alreadyExists: false });
}
