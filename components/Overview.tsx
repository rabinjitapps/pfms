'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { PortfolioSummary, StockPortfolioSummary, ExpenseSummary } from '@/types';
import AppShell from './AppShell';
import styles from './Overview.module.css';

function formatINR(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatStatementDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(year, m - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

interface TopMover {
  name: string;
  gainLossPct: number;
  gainLoss: number;
  href: string;
}

export default function Overview({ displayName }: { displayName: string }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [funds, setFunds] = useState<PortfolioSummary | null>(null);
  const [stocks, setStocks] = useState<StockPortfolioSummary | null>(null);
  const [expenses, setExpenses] = useState<ExpenseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [fundsRes, stocksRes, expensesRes] = await Promise.all([
        fetch('/api/holdings'),
        fetch('/api/stock-holdings'),
        fetch('/api/expense-entries'),
      ]);

      if (!fundsRes.ok || !stocksRes.ok || !expensesRes.ok) {
        setError('Could not load all of your data. Some figures below may be missing.');
      }

      const [fundsData, stocksData, expensesData] = await Promise.all([
        fundsRes.ok ? fundsRes.json() : null,
        stocksRes.ok ? stocksRes.json() : null,
        expensesRes.ok ? expensesRes.json() : null,
      ]);

      setFunds(fundsData);
      setStocks(stocksData);
      setExpenses(expensesData);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cashPosition = expenses?.netWithCarryForward ?? 0;
  const fundsValue = funds?.currentValue ?? 0;
  const stocksValue = stocks?.currentValue ?? 0;
  const netWorth = fundsValue + stocksValue + cashPosition;

  const investedTotal = (funds?.totalInvested ?? 0) + (stocks?.totalInvested ?? 0);
  const gainLossTotal = (funds?.totalGainLoss ?? 0) + (stocks?.totalGainLoss ?? 0);
  const gainLossPositive = gainLossTotal >= 0;

  const topMovers = useMemo(() => {
    const movers: TopMover[] = [];
    for (const h of funds?.holdings ?? []) {
      movers.push({ name: h.fund.name, gainLossPct: h.gainLossPct, gainLoss: h.gainLoss, href: '/' });
    }
    for (const h of stocks?.holdings ?? []) {
      movers.push({ name: h.stock.name, gainLossPct: h.gainLossPct, gainLoss: h.gainLoss, href: '/stocks' });
    }
    if (movers.length === 0) return { best: null, worst: null };
    const sorted = [...movers].sort((a, b) => b.gainLossPct - a.gainLossPct);
    return { best: sorted[0], worst: sorted[sorted.length - 1] };
  }, [funds, stocks]);

  if (loading) {
    return (
      <AppShell active="overview" displayName={displayName}>
        <div className={styles.page}>
          <p className={styles.loadingText}>Loading your overview…</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell active="overview" displayName={displayName}>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <span className={styles.eyebrow}>Overview &middot; as of {formatStatementDate(today)}</span>
          <h2 className={styles.pageTitle}>Dashboard</h2>
        </header>

        <main className={styles.main}>
          {error && <p className={styles.errorBanner}>{error}</p>}

          <section className={styles.netWorthCard}>
            <p className={styles.netWorthLabel}>Net worth</p>
            <p className={styles.netWorthValue}>₹{formatINR(netWorth)}</p>
            <div className={styles.netWorthBreakdown}>
              <span>Funds + stocks invested: ₹{formatINR(investedTotal)}</span>
              <span className={gainLossPositive ? styles.gainPositive : styles.gainNegative}>
                {gainLossPositive ? '+' : ''}₹{formatINR(gainLossTotal)} overall gain/loss
              </span>
            </div>
          </section>

          <div className={styles.cardGrid}>
            <Link href="/" className={styles.summaryCard}>
              <p className={styles.cardLabel}>Funds</p>
              <p className={styles.cardValue}>₹{formatINR(fundsValue)}</p>
              <p className={(funds?.totalGainLoss ?? 0) >= 0 ? styles.cardSubPositive : styles.cardSubNegative}>
                {(funds?.totalGainLoss ?? 0) >= 0 ? '+' : ''}₹{formatINR(funds?.totalGainLoss ?? 0)}
                {' '}({(funds?.totalGainLossPct ?? 0).toFixed(2)}%)
              </p>
              <p className={styles.cardMeta}>{funds?.holdings.length ?? 0} fund{(funds?.holdings.length ?? 0) === 1 ? '' : 's'} held</p>
            </Link>

            <Link href="/stocks" className={styles.summaryCard}>
              <p className={styles.cardLabel}>Stocks</p>
              <p className={styles.cardValue}>₹{formatINR(stocksValue)}</p>
              <p className={(stocks?.totalGainLoss ?? 0) >= 0 ? styles.cardSubPositive : styles.cardSubNegative}>
                {(stocks?.totalGainLoss ?? 0) >= 0 ? '+' : ''}₹{formatINR(stocks?.totalGainLoss ?? 0)}
                {' '}({(stocks?.totalGainLossPct ?? 0).toFixed(2)}%)
              </p>
              <p className={styles.cardMeta}>{stocks?.holdings.length ?? 0} stock{(stocks?.holdings.length ?? 0) === 1 ? '' : 's'} held</p>
            </Link>

            <Link href="/expenses" className={styles.summaryCard}>
              <p className={styles.cardLabel}>Cash position</p>
              <p className={cashPosition >= 0 ? styles.cardValue : styles.cardValueNegative}>
                {cashPosition < 0 ? '−' : ''}₹{formatINR(Math.abs(cashPosition))}
              </p>
              <p className={styles.cardSubNeutral}>
                {expenses ? formatMonthLabel(expenses.month) : ''}
              </p>
              <p className={styles.cardMeta}>
                Net this month: {(expenses?.net ?? 0) >= 0 ? '+' : '−'}₹{formatINR(Math.abs(expenses?.net ?? 0))}
              </p>
            </Link>
          </div>

          {(topMovers.best || topMovers.worst) && (
            <section className={styles.moversSection}>
              <p className={styles.sectionHeading}>Top movers</p>
              <div className={styles.moversGrid}>
                {topMovers.best && (
                  <Link href={topMovers.best.href} className={styles.moverCard}>
                    <span className={styles.moverTag}>Best performer</span>
                    <span className={styles.moverName}>{topMovers.best.name}</span>
                    <span className={styles.moverPctPositive}>
                      {topMovers.best.gainLossPct >= 0 ? '+' : ''}{topMovers.best.gainLossPct.toFixed(2)}%
                    </span>
                  </Link>
                )}
                {topMovers.worst && topMovers.worst !== topMovers.best && (
                  <Link href={topMovers.worst.href} className={styles.moverCard}>
                    <span className={styles.moverTag}>Needs attention</span>
                    <span className={styles.moverName}>{topMovers.worst.name}</span>
                    <span
                      className={
                        topMovers.worst.gainLossPct >= 0 ? styles.moverPctPositive : styles.moverPctNegative
                      }
                    >
                      {topMovers.worst.gainLossPct >= 0 ? '+' : ''}{topMovers.worst.gainLossPct.toFixed(2)}%
                    </span>
                  </Link>
                )}
              </div>
            </section>
          )}

          {expenses && (
            <section className={styles.cashFlowSection}>
              <p className={styles.sectionHeading}>
                Cash flow &middot; {formatMonthLabel(expenses.month)}
              </p>
              <div className={styles.cashFlowGrid}>
                <div>
                  <p className={styles.cashFlowLabel}>Brought forward</p>
                  <p className={expenses.carryForward >= 0 ? styles.cashFlowValuePositive : styles.cashFlowValueNegative}>
                    {expenses.carryForward >= 0 ? '+' : '−'}₹{formatINR(Math.abs(expenses.carryForward))}
                  </p>
                </div>
                <div>
                  <p className={styles.cashFlowLabel}>Inflow</p>
                  <p className={styles.cashFlowValuePositive}>₹{formatINR(expenses.totalInflow)}</p>
                </div>
                <div>
                  <p className={styles.cashFlowLabel}>Outflow</p>
                  <p className={styles.cashFlowValueNegative}>₹{formatINR(expenses.totalOutflow)}</p>
                </div>
                <div>
                  <p className={styles.cashFlowLabel}>Closing balance</p>
                  <p className={expenses.netWithCarryForward >= 0 ? styles.cashFlowValuePositive : styles.cashFlowValueNegative}>
                    {expenses.netWithCarryForward >= 0 ? '+' : '−'}₹{formatINR(Math.abs(expenses.netWithCarryForward))}
                  </p>
                </div>
              </div>
            </section>
          )}

          <div className={styles.quickLinks}>
            <Link href="/expense-analysis" className={styles.quickLinkBtn}>
              View expense analysis →
            </Link>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
