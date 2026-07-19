import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/session';
import {
  generateFocusedAnalysis,
  AIInsightsError,
  FocusArea,
  FocusAnalysisPayload,
} from '@/lib/aiInsights';

export const maxDuration = 60;

const VALID_AREAS: FocusArea[] = ['funds', 'stocks', 'expenses'];

// Same pattern as /api/ai-insights: the client already has this aggregated
// data on-screen (built from the same summary endpoints the page itself
// calls), so we accept it as the request body rather than re-querying and
// re-deriving it here. This route just checks auth, validates the shape
// loosely, and forwards a scoped, aggregated payload to the LLM.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { area?: string; data?: FocusAnalysisPayload };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const area = body?.area;
  if (!area || !VALID_AREAS.includes(area as FocusArea)) {
    return NextResponse.json(
      { error: `Invalid area. Must be one of: ${VALID_AREAS.join(', ')}` },
      { status: 400 }
    );
  }

  if (!body.data || typeof body.data !== 'object') {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }

  try {
    const result = await generateFocusedAnalysis(area as FocusArea, body.data);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AIInsightsError) {
      console.error('AI analyze error:', err.message);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error('Unexpected AI analyze failure:', err);
    return NextResponse.json({ error: 'Failed to generate analysis' }, { status: 500 });
  }
}
