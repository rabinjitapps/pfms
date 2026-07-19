'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PortfolioSummary,
  StockPortfolioSummary,
  ExpenseSummary,
  ExpenseAnalysis,
  Loan,
  BankPortfolioSummary,
  CreditCardPortfolioSummary,
} from '@/types';
import { buildPortfolioSummary } from '@/lib/loanSchedule';
import AppShell from './AppShell';
import styles from './AIInsights.module.css';

interface Insight {
  title: string;
  detail: string;
  severity: 'positive' | 'warning' | 'tip' | 'info';
}

interface InsightArea {
  key: 'overview' | 'expenses' | 'funds' | 'stocks' | 'loans';
  insights: Insight[];
}

interface AIInsightsResult {
  summary: string;
  areas: InsightArea[];
  generatedAt: string;
}

const AREA_LABELS: Record<InsightArea['key'], string> = {
  overview: 'Overview',
  expenses: 'Expenses',
  funds: 'Mutual funds',
  stocks: 'Stocks',
  loans: 'Loans',
};

function formatINR(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatGeneratedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function severityLabel(s: Insight['severity']): string {
  switch (s) {
    case 'positive':
      return 'Going well';
    case 'warning':
      return 'Needs attention';
    case 'tip':
      return 'Tip';
    default:
      return 'Note';
  }
}

export default function AIInsights({ displayName }: { displayName: string }) {
  const [funds, setFunds] = useState<PortfolioSummary | null>(null);
  const [stocks, setStocks] = useState<StockPortfolioSummary | null>(null);
  const [expenses, setExpenses] = useState<ExpenseSummary | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [expenseHeads, setExpenseHeads] = useState<ExpenseAnalysis | null>(null);
  const [bank, setBank] = useState<BankPortfolioSummary | null>(null);
  const [cards, setCards] = useState<CreditCardPortfolioSummary | null>(null);

  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState('');

  const [insights, setInsights] = useState<AIInsightsResult | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState('');

  const loadData = useCallback(async () => {
    setDataError('');
    try {
      const [fundsRes, stocksRes, expensesRes, loansRes, headsRes, bankRes, cardsRes] = await Promise.all([
        fetch('/api/holdings'),
        fetch('/api/stock-holdings'),
        fetch('/api/expense-entries'),
        fetch('/api/loans'),
        fetch('/api/expense-analysis?periodType=month&direction=OUTFLOW'),
        fetch('/api/bank-accounts'),
        fetch('/api/credit-cards'),
      ]);

      if (!fundsRes.ok || !stocksRes.ok || !expensesRes.ok) {
        setDataError('Could not load all of your data. Insights below may be based on partial figures.');
      }

      const [fundsData, stocksData, expensesData, loansData, headsData, bankData, cardsData] = await Promise.all([
        fundsRes.ok ? fundsRes.json() : null,
        stocksRes.ok ? stocksRes.json() : null,
        expensesRes.ok ? expensesRes.json() : null,
        loansRes.ok ? loansRes.json() : null,
        headsRes.ok ? headsRes.json() : null,
        bankRes.ok ? bankRes.json() : null,
        cardsRes.ok ? cardsRes.json() : null,
      ]);

      setFunds(fundsData);
      setStocks(stocksData);
      setExpenses(expensesData);
      setLoans(loansData?.loans ?? []);
      setExpenseHeads(headsData);
      setBank(bankData?.portfolio ?? null);
      setCards(cardsData?.portfolio ?? null);
    } catch {
      setDataError('Could not reach the server.');
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loanPortfolio = useMemo(() => {
    if (loans.length === 0) return null;
    return buildPortfolioSummary(loans);
  }, [loans]);

  const snapshot = useMemo(() => {
    const cashPosition = expenses?.netWithCarryForward ?? 0;
    const fundsValue = funds?.currentValue ?? 0;
    const stocksValue = stocks?.currentValue ?? 0;
    const netWorth = fundsValue + stocksValue + cashPosition;

    const sortedFundHoldings = [...(funds?.holdings ?? [])].sort((a, b) => b.gainLossPct - a.gainLossPct);
    const sortedStockHoldings = [...(stocks?.holdings ?? [])].sort((a, b) => b.gainLossPct - a.gainLossPct);

    return {
      netWorth,
      cashPosition,
      funds: funds
        ? {
            count: funds.holdings.length,
            invested: funds.totalInvested,
            currentValue: funds.currentValue,
            gainLoss: funds.totalGainLoss,
            gainLossPct: funds.totalGainLossPct,
            best: sortedFundHoldings.slice(0, 3).map((h) => ({ name: h.fund.name, gainLossPct: h.gainLossPct })),
            worst: sortedFundHoldings.slice(-3).reverse().map((h) => ({ name: h.fund.name, gainLossPct: h.gainLossPct })),
          }
        : null,
      stocks: stocks
        ? {
            count: stocks.holdings.length,
            invested: stocks.totalInvested,
            currentValue: stocks.currentValue,
            gainLoss: stocks.totalGainLoss,
            gainLossPct: stocks.totalGainLossPct,
            best: sortedStockHoldings.slice(0, 3).map((h) => ({ name: h.stock.name, gainLossPct: h.gainLossPct })),
            worst: sortedStockHoldings.slice(-3).reverse().map((h) => ({ name: h.stock.name, gainLossPct: h.gainLossPct })),
          }
        : null,
      expenses: expenses
        ? {
            month: expenses.month,
            totalInflow: expenses.totalInflow,
            totalOutflow: expenses.totalOutflow,
            net: expenses.net,
            netWithCarryForward: expenses.netWithCarryForward,
            topExpenseHeads: [...(expenseHeads?.totals ?? [])]
              .sort((a, b) => b.total - a.total)
              .slice(0, 5)
              .map((t) => ({ name: t.categoryName, total: t.total })),
          }
        : null,
      loans: loanPortfolio
        ? {
            count: loanPortfolio.loans.length,
            totalOutstanding: loanPortfolio.total_outstanding,
            totalMonthlyEmi: loanPortfolio.total_monthly_emi,
            totalInterestRemaining: loanPortfolio.total_outstanding_interest,
            debtFreeDate: loanPortfolio.debt_free_date ?? null,
            items: loanPortfolio.loans.map((l) => ({
              name: l.loan.name,
              type: l.loan.loan_type,
              outstanding: l.is_open_ended
                ? (l.loan.outstanding_principal ?? 0)
                : l.total_amount_pending,
              emi: l.loan.emi_amount,
              interestRatePct: l.loan.interest_rate,
            })),
          }
        : null,
      bankAccounts: bank
        ? {
            count: bank.accounts.length,
            totalBalance: bank.total_balance,
          }
        : null,
      creditCards: cards
        ? {
            count: cards.cards.length,
            totalBalance: cards.total_balance,
            totalCreditLimit: cards.total_credit_limit,
            utilizationPct: cards.total_credit_limit > 0 ? (cards.total_balance / cards.total_credit_limit) * 100 : 0,
          }
        : null,
    };
  }, [funds, stocks, expenses, expenseHeads, loanPortfolio, bank, cards]);

  const hasAnyData = Boolean(
    snapshot.funds || snapshot.stocks || snapshot.expenses || snapshot.loans || snapshot.bankAccounts || snapshot.creditCards
  );

  const generateInsights = useCallback(async () => {
    setInsightsLoading(true);
    setInsightsError('');
    try {
      const res = await fetch('/api/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      const data = await res.json();
      if (!res.ok) {
        setInsightsError(data?.error || 'Could not generate insights right now.');
        setInsights(null);
        return;
      }
      setInsights(data);
    } catch {
      setInsightsError('Could not reach the server.');
    } finally {
      setInsightsLoading(false);
    }
  }, [snapshot]);

  useEffect(() => {
    if (!dataLoading && hasAnyData && !insights && !insightsLoading && !insightsError) {
      generateInsights();
    }
    // Only auto-run once, right after data finishes loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataLoading, hasAnyData]);

  const overviewArea = insights?.areas.find((a) => a.key === 'overview');
  const otherAreas = insights?.areas.filter((a) => a.key !== 'overview') ?? [];

  if (dataLoading) {
    return (
      <AppShell active="ai-insights" displayName={displayName}>
        <div className={styles.page}>
          <p className={styles.loadingText}>Gathering your data…</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell active="ai-insights" displayName={displayName}>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <span className={styles.eyebrow}>Personalized &middot; powered by Claude</span>
          <h2 className={styles.pageTitle}>AI Insights</h2>
        </header>

        <main className={styles.main}>
          {dataError && <p className={styles.errorBanner}>{dataError}</p>}

          {!hasAnyData && (
            <section className={styles.emptyState}>
              <p>
                There isn&apos;t enough data yet to generate insights. Add a few funds, stocks, expenses, or loans
                first, then come back here.
              </p>
            </section>
          )}

          {hasAnyData && (
            <>
              <div className={styles.toolbar}>
                <button
                  className={styles.refreshBtn}
                  onClick={generateInsights}
                  disabled={insightsLoading}
                >
                  {insightsLoading ? 'Generating…' : insights ? 'Regenerate insights' : 'Generate insights'}
                </button>
                {insights && (
                  <span className={styles.generatedAt}>Generated {formatGeneratedAt(insights.generatedAt)}</span>
                )}
              </div>

              {insightsError && <p className={styles.errorBanner}>{insightsError}</p>}

              {insightsLoading && !insights && (
                <section className={styles.emptyState}>
                  <p>Reading through your funds, stocks, expenses, and loans…</p>
                </section>
              )}

              {insights && (
                <>
                  <section className={styles.summaryCard}>
                    <p className={styles.summaryLabel}>The picture, in short</p>
                    <p className={styles.summaryText}>{insights.summary}</p>
                  </section>

                  {overviewArea && overviewArea.insights.length > 0 && (
                    <section className={styles.areaSection}>
                      <div className={styles.insightGrid}>
                        {overviewArea.insights.map((ins, i) => (
                          <div key={i} className={`${styles.insightCard} ${styles[`sev_${ins.severity}`]}`}>
                            <span className={styles.insightTag}>{severityLabel(ins.severity)}</span>
                            <p className={styles.insightTitle}>{ins.title}</p>
                            <p className={styles.insightDetail}>{ins.detail}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {otherAreas.map((area) => (
                    <section key={area.key} className={styles.areaSection}>
                      <p className={styles.sectionHeading}>{AREA_LABELS[area.key]}</p>
                      <div className={styles.insightGrid}>
                        {area.insights.map((ins, i) => (
                          <div key={i} className={`${styles.insightCard} ${styles[`sev_${ins.severity}`]}`}>
                            <span className={styles.insightTag}>{severityLabel(ins.severity)}</span>
                            <p className={styles.insightTitle}>{ins.title}</p>
                            <p className={styles.insightDetail}>{ins.detail}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </>
              )}

              <section className={styles.snapshotFooter}>
                <p className={styles.snapshotFooterText}>
                  Based on a net worth of ₹{formatINR(snapshot.netWorth)} across{' '}
                  {snapshot.funds ? `${snapshot.funds.count} fund${snapshot.funds.count === 1 ? '' : 's'}, ` : ''}
                  {snapshot.stocks ? `${snapshot.stocks.count} stock${snapshot.stocks.count === 1 ? '' : 's'}, ` : ''}
                  {snapshot.loans ? `${snapshot.loans.count} loan${snapshot.loans.count === 1 ? '' : 's'}, ` : ''}
                  and this month&apos;s expenses. No numbers are stored outside your own data — each request is
                  generated fresh.
                </p>
              </section>
            </>
          )}
        </main>
      </div>
    </AppShell>
  );
}
