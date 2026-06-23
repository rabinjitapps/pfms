import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { Holding, HoldingSummary, PortfolioSummary } from '@/types';

function summarize(holding: Holding): HoldingSummary {
  const buys = holding.transactions.filter((t) => t.type === 'BUY');
  const sells = holding.transactions.filter((t) => t.type === 'SELL');

  const buyUnits = buys.reduce((sum, t) => sum + Number(t.units), 0);
  const sellUnits = sells.reduce((sum, t) => sum + Number(t.units), 0);
  // Kept as buyUnits - sellUnits (not derived from the lots below) so a
  // sell that exceeds everything bought still surfaces as a negative
  // number here — a data problem worth spotting, not hiding.
  const totalUnits = buyUnits - sellUnits;

  const sellAmount = sells.reduce((sum, t) => sum + Number(t.amount), 0);

  // Invested amount = cost basis still held, using FIFO: each BUY opens
  // a "lot", and SELLs consume the oldest open lots first. This mirrors
  // how a person naturally thinks about which units they sold (and how
  // Indian mutual fund capital-gains rules treat it), rather than
  // smearing one sell across every lot via a simple average cost.
  const chronological = [...holding.transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.created_at < b.created_at ? -1 : 1;
  });

  type Lot = { remainingUnits: number; costPerUnit: number };
  const lots: Lot[] = [];

  for (const t of chronological) {
    const units = Number(t.units);
    if (t.type === 'BUY') {
      const costPerUnit = units > 0 ? Number(t.amount) / units : 0;
      lots.push({ remainingUnits: units, costPerUnit });
    } else {
      let toSell = units;
      for (const lot of lots) {
        if (toSell <= 0) break;
        if (lot.remainingUnits <= 0) continue;
        const consumed = Math.min(lot.remainingUnits, toSell);
        lot.remainingUnits -= consumed;
        toSell -= consumed;
      }
      // If toSell > 0 here, this sell exceeded everything bought so far.
      // There's no remaining cost to remove for the excess — the
      // negative totalUnits above is what flags that data issue.
    }
  }

  const remainingLotUnits = lots.reduce((sum, l) => sum + l.remainingUnits, 0);
  const investedAmount = lots.reduce((sum, l) => sum + l.remainingUnits * l.costPerUnit, 0);
  const avgNav = remainingLotUnits > 0 ? investedAmount / remainingLotUnits : 0;

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
    redeemedAmount: sellAmount,
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
  const summaries = holdings
    .map(summarize)
    .sort((a, b) => b.currentValue - a.currentValue);

  const totalInvested = summaries.reduce((sum, h) => sum + h.investedAmount, 0);
  const currentValue = summaries.reduce((sum, h) => sum + h.currentValue, 0);
  const totalGainLoss = currentValue - totalInvested;
  const totalGainLossPct = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;
  const totalRedeemed = summaries.reduce((sum, h) => sum + h.redeemedAmount, 0);

  const portfolio: PortfolioSummary = {
    totalInvested,
    currentValue,
    totalGainLoss,
    totalGainLossPct,
    totalRedeemed,
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
