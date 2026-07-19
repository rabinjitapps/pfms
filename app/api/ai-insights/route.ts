import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/session';
import { generateAIInsights, AIInsightsError, FinancialSnapshot } from '@/lib/aiInsights';

// The client already has every number in this snapshot on-screen (it's
// built from the same summary endpoints the Overview page calls), so we
// accept it as the request body rather than re-querying and re-deriving
// FIFO/loan-schedule math a second time here. This route's job is just to
// validate the shape loosely, add the user's auth check, and forward a
// minimal, aggregated payload to the LLM — no raw transactions, account
// numbers, or card numbers ever leave the summary stage.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let snapshot: FinancialSnapshot;
  try {
    snapshot = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!snapshot || typeof snapshot !== 'object') {
    return NextResponse.json({ error: 'Invalid snapshot' }, { status: 400 });
  }

  try {
    const result = await generateAIInsights(snapshot);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AIInsightsError) {
      console.error('AI insights error:', err.message);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error('Unexpected AI insights failure:', err);
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 });
  }
}
