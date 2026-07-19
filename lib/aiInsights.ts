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

const SYSTEM_PROMPT = `You are a careful, encouraging personal finance analyst embedded in a personal finance management app used in India (amounts are in INR, ₹, using the lakh/crore grouping — e.g. 2,89,454, not 289,454). You are given one person's aggregated financial snapshot — mutual funds, stocks, expenses, loans, bank accounts, and credit cards — and must produce short, specific, genuinely useful, ACTIONABLE observations.

Critical rule on numbers:
- NEVER retype, reformat, recompute, or re-group any rupee figure from the snapshot. Copy the exact digits from the JSON field verbatim and only add ₹ and Indian comma grouping (e.g. a value of 289454.99 in the JSON must appear as ₹2,89,454.99 — do not write ₹28,94,454). If you are not fully certain of the correct grouping for a number, write it with plain digits and no commas rather than risk a wrong grouping.
- Do not restate the same number as both the title and the detail of an insight — that wastes a card. Every insight must add interpretation, comparison, or a recommendation beyond the raw figure.

Rules:
- Base every insight strictly on the numbers given. Never invent figures, account names, or transactions that aren't present.
- Prioritize actionable, prescriptive insights — what the person should DO or AVOID doing — grounded in the actual numbers (e.g. "Your loan EMIs eat 42% of monthly outflow — avoid taking on new EMI-based debt until this drops closer to 30%" rather than "Your EMI is ₹X"). Favor "do this" / "avoid this" phrasing over passive description wherever the data supports it.
- Compare figures to sensible personal-finance benchmarks where relevant (e.g. EMI-to-income ratio, credit utilization above 30%, emergency fund coverage in months of expenses, concentration risk if one holding dominates a portfolio) rather than just reporting the number in isolation.
- Keep each insight to 1-2 short sentences, but make every sentence carry a recommendation, comparison, or consequence — not just a fact already visible on the dashboard.
- Use severity "positive" for things going well, "warning" for things that need attention (e.g. high credit utilization, negative cash position, concentrated losses, EMI burden too high), "tip" for an actionable suggestion (something to start or stop doing), and "info" for a neutral observation worth noting.
- Only include an area if the snapshot actually has data for it — omit empty areas entirely.
- Do not give specific investment buy/sell recommendations for named funds or stocks; you may comment on diversification, concentration, rebalancing, or performance trends only.
- The "overview" area should give a genuine cross-cutting picture — e.g. how expenses, loans, and investments interact (are investments being funded by surplus or is debt crowding them out?) — not just a repeat of individual area insights.
- Respond with ONLY valid JSON matching this exact TypeScript shape, no markdown fences, no commentary outside the JSON:

{
  "summary": string, // 2-3 sentence overall picture, in a warm but plain-spoken tone, with at least one concrete "so what" takeaway
  "areas": [
    {
      "key": "overview" | "expenses" | "funds" | "stocks" | "loans",
      "insights": [
        { "title": string, "detail": string, "severity": "positive" | "warning" | "tip" | "info" }
      ]
    }
  ]
}

Aim for 3-5 insights per area, and 3-6 areas total including "overview". Include at least one clear "do this" or "avoid this" recommendation per area where the data supports it.`;

export class AIInsightsError extends Error {}

// Route-level maxDuration is 60s. Give the outbound call a shorter cap so we
// can fail with a clear, specific error instead of letting Vercel kill the
// whole function with an opaque FUNCTION_INVOCATION_TIMEOUT / 504.
const PROVIDER_TIMEOUT_MS = 45_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  providerLabel: string,
  timeoutMs: number = PROVIDER_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AIInsightsError(
        `${providerLabel} took longer than ${Math.round(timeoutMs / 1000)}s to respond and was aborted. The model may be overloaded — try again, or switch to a smaller/faster model.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export type AIProvider = 'anthropic' | 'openai' | 'nvidia' | 'emergent';

function resolveProvider(): AIProvider {
  const raw = (process.env.AI_INSIGHTS_PROVIDER || 'anthropic').toLowerCase().trim();
  if (raw === 'anthropic' || raw === 'openai' || raw === 'nvidia' || raw === 'emergent') return raw;
  throw new AIInsightsError(
    `Unknown AI_INSIGHTS_PROVIDER "${raw}". Use one of: anthropic, openai, nvidia, emergent.`
  );
}

// ----------------------------------------------------------------------
// Anthropic — native Messages API (system + messages, x-api-key header)
// ----------------------------------------------------------------------
async function callAnthropic(systemPrompt: string, userContent: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AIInsightsError('ANTHROPIC_API_KEY is not configured on the server.');
  const model = process.env.ANTHROPIC_INSIGHTS_MODEL || 'claude-sonnet-5';

  const res = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
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
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    },
    'Anthropic'
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AIInsightsError(`Anthropic API request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === 'text');
  const raw: string | undefined = textBlock?.text;
  if (!raw) throw new AIInsightsError('Anthropic API returned no text content.');
  return raw;
}

// ----------------------------------------------------------------------
// Generic OpenAI-compatible chat/completions caller — used for OpenAI
// itself, NVIDIA NIM, and Emergent's Universal Key, since all three
// expose the same request/response shape (Bearer auth, `messages` array
// with a system role, `choices[0].message.content` in the response).
// ----------------------------------------------------------------------
async function callOpenAICompatible(opts: {
  providerLabel: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userContent: string;
}): Promise<string> {
  const { providerLabel, baseUrl, apiKey, model, systemPrompt, userContent } = opts;

  const res = await fetchWithTimeout(
    `${baseUrl.replace(/\/$/, '')}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
    },
    providerLabel
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AIInsightsError(`${providerLabel} API request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const raw: string | undefined = data?.choices?.[0]?.message?.content;
  if (!raw) throw new AIInsightsError(`${providerLabel} API returned no content.`);
  return raw;
}

async function callOpenAI(systemPrompt: string, userContent: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AIInsightsError('OPENAI_API_KEY is not configured on the server.');
  const model = process.env.OPENAI_INSIGHTS_MODEL || 'gpt-5.6-terra';
  return callOpenAICompatible({
    providerLabel: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey,
    model,
    systemPrompt,
    userContent,
  });
}

async function callNvidia(systemPrompt: string, userContent: string): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new AIInsightsError('NVIDIA_API_KEY is not configured on the server.');
  // A small (8B) model is fast but unreliable at faithfully copying
  // multi-digit Indian lakh/crore-grouped rupee figures — it will silently
  // misplace commas and invent wrong numbers. A 70B model is accurate but
  // risks queueing/timeouts on the free tier. Nemotron Super 49B is the
  // documented sweet spot on NVIDIA's free catalog. Override with
  // NVIDIA_INSIGHTS_MODEL if you want to tune this further.
  const model = process.env.NVIDIA_INSIGHTS_MODEL || 'nvidia/llama-3.3-nemotron-super-49b-v1';
  return callOpenAICompatible({
    providerLabel: 'NVIDIA',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKey,
    model,
    systemPrompt,
    userContent,
  });
}

// Emergent's Universal Key is normally consumed from inside apps built on
// the Emergent platform itself, so there isn't one universally documented
// public base URL for calling it from an external, self-hosted app like
// this one. It does speak the same OpenAI-compatible chat/completions
// shape though, so EMERGENT_API_BASE_URL is left configurable — check
// your Emergent dashboard / integration docs for the exact value to use.
async function callEmergent(systemPrompt: string, userContent: string): Promise<string> {
  const apiKey = process.env.EMERGENT_API_KEY;
  if (!apiKey) throw new AIInsightsError('EMERGENT_API_KEY is not configured on the server.');
  const baseUrl = process.env.EMERGENT_API_BASE_URL;
  if (!baseUrl) {
    throw new AIInsightsError(
      'EMERGENT_API_BASE_URL is not configured. Check your Emergent dashboard for the correct base URL for your Universal Key.'
    );
  }
  const model = process.env.EMERGENT_INSIGHTS_MODEL || 'gpt-5.6-terra';
  return callOpenAICompatible({
    providerLabel: 'Emergent',
    baseUrl,
    apiKey,
    model,
    systemPrompt,
    userContent,
  });
}

// Single dispatcher shared by the full-snapshot AI Insights page and the
// per-area focused analysis (funds / stocks / expenses) — both just need
// "give me a system prompt + user content, hand back raw text" from
// whichever provider is configured.
async function callProvider(systemPrompt: string, userContent: string): Promise<string> {
  const provider = resolveProvider();
  switch (provider) {
    case 'anthropic':
      return callAnthropic(systemPrompt, userContent);
    case 'openai':
      return callOpenAI(systemPrompt, userContent);
    case 'nvidia':
      return callNvidia(systemPrompt, userContent);
    case 'emergent':
      return callEmergent(systemPrompt, userContent);
  }
}

function cleanJsonResponse(raw: string): string {
  return raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
}

export async function generateAIInsights(snapshot: FinancialSnapshot): Promise<AIInsightsResult> {
  const userContent = `Here is the financial snapshot (JSON):\n\n${JSON.stringify(snapshot, null, 2)}\n\nProduce the insights JSON now.`;
  const raw = await callProvider(SYSTEM_PROMPT, userContent);

  const cleaned = cleanJsonResponse(raw);

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

// ----------------------------------------------------------------------
// Focused per-area analysis — "Analyze" buttons on the Fund Analysis,
// Stocks, and Expense Analysis pages. Same style of numbered-fact
// discipline and actionable-insight rules as the full snapshot above, but
// scoped to a single area and given more room to go deep on that area
// specifically (concentration, category benchmarks, spending patterns).
// ----------------------------------------------------------------------

export type FocusArea = 'funds' | 'stocks' | 'expenses';

export interface FocusAnalysisResult {
  summary: string;
  insights: Insight[];
  generatedAt: string;
}

export interface FundsAnalysisPayload {
  totalInvested: number;
  currentValue: number;
  totalGainLoss: number;
  totalGainLossPct: number;
  holdings: {
    name: string;
    category: string | null;
    investedAmount: number;
    currentValue: number;
    gainLoss: number;
    gainLossPct: number;
  }[];
}

export interface StocksAnalysisPayload {
  totalInvested: number;
  currentValue: number;
  totalGainLoss: number;
  totalGainLossPct: number;
  portfolioXirrPct: number | null;
  holdings: {
    name: string;
    symbol: string;
    investedAmount: number;
    currentValue: number;
    gainLoss: number;
    gainLossPct: number;
    xirrPct: number | null;
  }[];
}

export interface ExpensesAnalysisPayload {
  periodLabel: string;
  direction: 'INFLOW' | 'OUTFLOW';
  grandTotal: number;
  totals: { categoryName: string; total: number }[];
  // A handful of recent months' totals, if available, so the model can
  // comment on trend (rising/falling/volatile) rather than one snapshot.
  recentMonths?: { month: string; totalInflow: number; totalOutflow: number }[];
}

export type FocusAnalysisPayload = FundsAnalysisPayload | StocksAnalysisPayload | ExpensesAnalysisPayload;

const FOCUS_NUMBER_RULE = `Critical rule on numbers: NEVER retype, reformat, recompute, or re-group any rupee figure from the data given. Copy the exact digits verbatim and only add ₹ and Indian comma grouping (e.g. a value of 289454.99 must appear as ₹2,89,454.99, not ₹28,94,454). If unsure of the correct grouping, write plain digits with no commas rather than risk a wrong one. Do not restate the same number as both the title and detail of an insight — every insight must add interpretation, comparison, or a recommendation beyond the raw figure.`;

function buildFocusSystemPrompt(area: FocusArea): string {
  const shared = `You are a careful, encouraging personal finance analyst embedded in a personal finance app used in India (amounts are in INR, ₹, lakh/crore grouping). ${FOCUS_NUMBER_RULE}

Prioritize actionable, prescriptive insights — what the person should DO or AVOID doing — grounded in the actual numbers, not generic advice. Favor "do this" / "avoid this" phrasing backed by a specific figure or comparison wherever the data supports it. Keep each insight to 1-2 sentences, but make every sentence carry a recommendation, comparison, or consequence.

Use severity "positive" for things going well, "warning" for things needing attention, "tip" for an actionable suggestion (something to start or stop doing), and "info" for a neutral observation worth noting.

Respond with ONLY valid JSON matching this exact shape, no markdown fences, no commentary outside the JSON:
{
  "summary": string, // 2-3 sentence overall read on this specific area, warm but plain-spoken, with a concrete "so what"
  "insights": [
    { "title": string, "detail": string, "severity": "positive" | "warning" | "tip" | "info" }
  ]
}
Aim for 5-8 insights.`;

  switch (area) {
    case 'funds':
      return `${shared}

You are analyzing ONLY this person's mutual fund portfolio (no stocks, expenses, or loans given). Focus on:
- Overall portfolio performance vs. what a reasonable index/category benchmark would suggest, in general terms (no need for exact benchmark data if not given).
- Concentration risk: is one fund or category dominating the portfolio? Suggest a rough healthy allocation range if it's skewed.
- Category diversification: large-cap vs mid/small-cap vs debt vs sectoral/thematic exposure, and whether sectoral/thematic bets (e.g. a single-sector fund) are an outsized share.
- Individual fund performance outliers — call out both the best and worst performers by name with their gain/loss %, and give a specific "keep/watch/reconsider" style read (never a direct buy/sell instruction, but concentration and rebalancing framing is fine).
- Do NOT give a specific buy/sell recommendation for any named fund; comment on diversification, concentration, and performance trend only.`;
    case 'stocks':
      return `${shared}

You are analyzing ONLY this person's direct equity (stocks) portfolio (no mutual funds, expenses, or loans given). Focus on:
- Concentration risk: is the portfolio dominated by one or two stocks or one sector? Direct equity is inherently riskier than diversified funds — call this out if the portfolio is small and concentrated.
- XIRR (annualized return) where given — flag if a holding's XIRR looks poor relative to its holding period, or if overall portfolio XIRR looks weak/strong.
- Individual stock winners and losers by name with gain/loss %, framed as "watch/reconsider/hold" reasoning rather than direct buy/sell instructions.
- Whether the person appears to be actively trading vs holding long-term, if inferable, and what risk that implies.
- Do NOT give a specific buy/sell recommendation for any named stock; comment on concentration, diversification, and performance trend only.`;
    case 'expenses':
      return `${shared}

You are analyzing ONLY this person's expense/income breakdown for the given period (no funds, stocks, or loans given). Focus on:
- Which category(ies) dominate spending, as a % of the total, and whether that concentration looks healthy or worth trimming.
- Specific, practical "cut this / watch this" suggestions tied to the actual top categories by name and amount — not generic "spend less" advice.
- If multiple months of data are given, comment on the trend (rising, falling, volatile) and what's driving it if inferable from category names.
- If this is INFLOW (income) data instead of expenses, focus on income concentration/diversity and stability instead of spending advice.`;
  }
}

export async function generateFocusedAnalysis(
  area: FocusArea,
  payload: FocusAnalysisPayload
): Promise<FocusAnalysisResult> {
  const systemPrompt = buildFocusSystemPrompt(area);
  const userContent = `Here is the ${area} data (JSON):\n\n${JSON.stringify(payload, null, 2)}\n\nProduce the analysis JSON now.`;
  const raw = await callProvider(systemPrompt, userContent);

  const cleaned = cleanJsonResponse(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AIInsightsError('Could not parse the AI response as JSON.');
  }

  const result = parsed as { summary?: unknown; insights?: unknown };
  if (typeof result.summary !== 'string' || !Array.isArray(result.insights)) {
    throw new AIInsightsError('AI response did not match the expected shape.');
  }

  const VALID_SEVERITIES: InsightSeverity[] = ['positive', 'warning', 'tip', 'info'];

  const insights: Insight[] = (result.insights as unknown[])
    .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
    .map((i) => ({
      title: typeof i.title === 'string' ? i.title : '',
      detail: typeof i.detail === 'string' ? i.detail : '',
      severity: VALID_SEVERITIES.includes(i.severity as InsightSeverity)
        ? (i.severity as InsightSeverity)
        : 'info',
    }))
    .filter((i) => i.title || i.detail);

  return {
    summary: result.summary as string,
    insights,
    generatedAt: new Date().toISOString(),
  };
}
