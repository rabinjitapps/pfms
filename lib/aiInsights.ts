// AI Insights — sends a compact, aggregated snapshot of the person's
// finances (no raw transaction-level data) to the Anthropic API and asks
// for a structured set of personalized observations, grouped by area
// (expenses, funds, stocks, loans) plus a short overall summary.
//
// Requires ANTHROPIC_API_KEY to be set in the environment. Server-side
// only — never call this from client code.

export type InsightSeverity = 'positive' | 'warning' | 'tip' | 'info';

export interface Insight {
  title: string;
  detail: string;
  severity: InsightSeverity;
}

export type InsightAreaKey = 'overview' | 'expenses' | 'funds' | 'stocks' | 'loans';

export interface InsightArea {
  key: InsightAreaKey;
  insights: Insight[];
}

export interface AIInsightsResult {
  summary: string;
  areas: InsightArea[];
  generatedAt: string;
}

// ----------------------------------------------------------------------
// Snapshot shape — the aggregated numbers the client sends up. Kept to
// summary-level figures only (no per-transaction rows, no account
// numbers) since this payload is forwarded to a third-party LLM.
// ----------------------------------------------------------------------

export interface FinancialSnapshot {
  netWorth: number;
  cashPosition: number;
  funds: {
    count: number;
    invested: number;
    currentValue: number;
    gainLoss: number;
    gainLossPct: number;
    best: { name: string; gainLossPct: number }[];
    worst: { name: string; gainLossPct: number }[];
  } | null;
  stocks: {
    count: number;
    invested: number;
    currentValue: number;
    gainLoss: number;
    gainLossPct: number;
    best: { name: string; gainLossPct: number }[];
    worst: { name: string; gainLossPct: number }[];
  } | null;
  expenses: {
    month: string;
    totalInflow: number;
    totalOutflow: number;
    net: number;
    netWithCarryForward: number;
    topExpenseHeads: { name: string; total: number }[];
  } | null;
  loans: {
    count: number;
    totalOutstanding: number;
    totalMonthlyEmi: number;
    totalInterestRemaining: number;
    debtFreeDate: string | null;
    items: { name: string; type: string; outstanding: number; emi: number; interestRatePct: number }[];
  } | null;
  bankAccounts: {
    count: number;
    totalBalance: number;
  } | null;
  creditCards: {
    count: number;
    totalBalance: number;
    totalCreditLimit: number;
    utilizationPct: number;
  } | null;
}

const SYSTEM_PROMPT = `You are a careful, encouraging personal finance analyst embedded in a personal finance management app used in India (amounts are in INR, ₹). You are given one person's aggregated financial snapshot — mutual funds, stocks, expenses, loans, bank accounts, and credit cards — and must produce short, specific, genuinely useful observations.

Rules:
- Base every insight strictly on the numbers given. Never invent figures, account names, or transactions that aren't present.
- Prefer concrete, specific observations ("your loan EMIs are 42% of monthly outflow" style reasoning) over generic advice like "consider saving more".
- Keep each insight to 1-2 short sentences.
- Use severity "positive" for things going well, "warning" for things that need attention (e.g. high credit utilization, negative cash position, concentrated losses), "tip" for an actionable suggestion, and "info" for a neutral observation worth noting.
- Only include an area if the snapshot actually has data for it — omit empty areas entirely.
- Do not give specific investment buy/sell recommendations for named funds or stocks; you may comment on diversification, concentration, or performance trends only.
- Respond with ONLY valid JSON matching this exact TypeScript shape, no markdown fences, no commentary outside the JSON:

{
  "summary": string, // 2-3 sentence overall picture, in a warm but plain-spoken tone
  "areas": [
    {
      "key": "overview" | "expenses" | "funds" | "stocks" | "loans",
      "insights": [
        { "title": string, "detail": string, "severity": "positive" | "warning" | "tip" | "info" }
      ]
    }
  ]
}

Aim for 2-4 insights per area, and 3-6 areas total including "overview".`;

export class AIInsightsError extends Error {}

export async function generateAIInsights(snapshot: FinancialSnapshot): Promise<AIInsightsResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AIInsightsError('ANTHROPIC_API_KEY is not configured on the server.');
  }

  const model = process.env.ANTHROPIC_INSIGHTS_MODEL || 'claude-sonnet-5';

  const userContent = `Here is the financial snapshot (JSON):\n\n${JSON.stringify(snapshot, null, 2)}\n\nProduce the insights JSON now.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      temperature: 0.4,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AIInsightsError(`Anthropic API request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === 'text');
  const raw: string | undefined = textBlock?.text;

  if (!raw) {
    throw new AIInsightsError('Anthropic API returned no text content.');
  }

  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AIInsightsError('Could not parse the AI response as JSON.');
  }

  const result = parsed as { summary?: unknown; areas?: unknown };
  if (typeof result.summary !== 'string' || !Array.isArray(result.areas)) {
    throw new AIInsightsError('AI response did not match the expected shape.');
  }

  const VALID_KEYS: InsightAreaKey[] = ['overview', 'expenses', 'funds', 'stocks', 'loans'];
  const VALID_SEVERITIES: InsightSeverity[] = ['positive', 'warning', 'tip', 'info'];

  const areas: InsightArea[] = (result.areas as unknown[])
    .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
    .map((a) => {
      const key = VALID_KEYS.includes(a.key as InsightAreaKey) ? (a.key as InsightAreaKey) : 'overview';
      const insights: Insight[] = Array.isArray(a.insights)
        ? (a.insights as unknown[])
            .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
            .map((i) => ({
              title: typeof i.title === 'string' ? i.title : '',
              detail: typeof i.detail === 'string' ? i.detail : '',
              severity: VALID_SEVERITIES.includes(i.severity as InsightSeverity)
                ? (i.severity as InsightSeverity)
                : 'info',
            }))
            .filter((i) => i.title || i.detail)
        : [];
      return { key, insights };
    })
    .filter((a) => a.insights.length > 0);

  return {
    summary: result.summary as string,
    areas,
    generatedAt: new Date().toISOString(),
  };
}
