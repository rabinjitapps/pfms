'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { PortfolioSummary, StockPortfolioSummary, CryptoPortfolioSummary, ExpenseSummary, ExpenseAnalysis, Loan } from '@/types';
import { getUpcomingEmis, UpcomingEmi, buildPortfolioSummary } from '@/lib/loanSchedule';
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

function formatDueDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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
  const [crypto, setCrypto] = useState<CryptoPortfolioSummary | null>(null);
  const [expenses, setExpenses] = useState<ExpenseSummary | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [expenseHeads, setExpenseHeads] = useState<ExpenseAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [fundsRes, stocksRes, cryptoRes, expensesRes, loansRes, headsRes] = await Promise.all([
        fetch('/api/holdings'),
        fetch('/api/stock-holdings'),
        fetch('/api/crypto-holdings'),
        fetch('/api/expense-entries'),
        fetch('/api/loans'),
        fetch('/api/expense-analysis?periodType=month&direction=OUTFLOW'),
      ]);

      if (!fundsRes.ok || !stocksRes.ok || !cryptoRes.ok || !expensesRes.ok) {
        setError('Could not load all of your data. Some figures below may be missing.');
      }

      const [fundsData, stocksData, cryptoData, expensesData, loansData, headsData] = await Promise.all([
        fundsRes.ok ? fundsRes.json() : null,
        stocksRes.ok ? stocksRes.json() : null,
        cryptoRes.ok ? cryptoRes.json() : null,
        expensesRes.ok ? expensesRes.json() : null,
        loansRes.ok ? loansRes.json() : null,
        headsRes.ok ? headsRes.json() : null,
      ]);

      setFunds(fundsData);
      setStocks(stocksData);
      setCrypto(cryptoData);
      setExpenses(expensesData);
      setLoans(loansData?.loans ?? []);
      setExpenseHeads(headsData);
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
  const cryptoValue = crypto?.currentValue ?? 0;
  const netWorth = fundsValue + stocksValue + cryptoValue + cashPosition;

  const investedTotal = (funds?.totalInvested ?? 0) + (stocks?.totalInvested ?? 0) + (crypto?.totalInvested ?? 0);
  const gainLossTotal = (funds?.totalGainLoss ?? 0) + (stocks?.totalGainLoss ?? 0) + (crypto?.totalGainLoss ?? 0);
  const gainLossPositive = gainLossTotal >= 0;

  const upcomingEmis = useMemo<UpcomingEmi[]>(() => {
    if (loans.length === 0) return [];
    return getUpcomingEmis(loans, 6);
  }, [loans]);

  const loanPortfolio = useMemo(() => {
    if (loans.length === 0) return null;
    return buildPortfolioSummary(loans);
  }, [loans]);

  const fundRankings = useMemo(() => {
    const movers: TopMover[] = (funds?.holdings ?? []).map((h) => ({
      name: h.fund.name,
      gainLossPct: h.gainLossPct,
      gainLoss: h.gainLoss,
      href: '/',
    }));
    const sorted = [...movers].sort((a, b) => b.gainLossPct - a.gainLossPct);
    const best = sorted.slice(0, 3);
    // Worst 3, taken from the bottom — but never re-using a fund already
    // shown in "best" when there are fewer than 6 funds total.
    const worstStart = Math.max(best.length, sorted.length - 3);
    const worst = sorted.slice(worstStart).reverse();
    return { best, worst };
  }, [funds]);

  const stockRankings = useMemo(() => {
    const movers: TopMover[] = (stocks?.holdings ?? []).map((h) => ({
      name: h.stock.name,
      gainLossPct: h.gainLossPct,
      gainLoss: h.gainLoss,
      href: '/stocks',
    }));
    if (movers.length === 0) return { best: null, worst: null };
    const sorted = [...movers].sort((a, b) => b.gainLossPct - a.gainLossPct);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    return { best, worst: worst === best ? null : worst };
  }, [stocks]);

  const cryptoRankings = useMemo(() => {
    const movers: TopMover[] = (crypto?.holdings ?? []).map((h) => ({
      name: h.crypto.name,
      gainLossPct: h.gainLossPct,
      gainLoss: h.gainLoss,
      href: '/crypto',
    }));
    if (movers.length === 0) return { best: null, worst: null };
    const sorted = [...movers].sort((a, b) => b.gainLossPct - a.gainLossPct);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    return { best, worst: worst === best ? null : worst };
  }, [crypto]);

  const topExpenseHeads = useMemo(() => {
    if (!expenseHeads) return [];
    return [...expenseHeads.totals].sort((a, b) => b.total - a.total).slice(0, 5);
  }, [expenseHeads]);

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
              <span>Funds + stocks + crypto invested: ₹{formatINR(investedTotal)}</span>
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

            <Link href="/crypto" className={styles.summaryCard}>
              <p className={styles.cardLabel}>Crypto</p>
              <p className={styles.cardValue}>₹{formatINR(cryptoValue)}</p>
              <p className={(crypto?.totalGainLoss ?? 0) >= 0 ? styles.cardSubPositive : styles.cardSubNegative}>
                {(crypto?.totalGainLoss ?? 0) >= 0 ? '+' : ''}₹{formatINR(crypto?.totalGainLoss ?? 0)}
                {' '}({(crypto?.totalGainLossPct ?? 0).toFixed(2)}%)
              </p>
              <p className={styles.cardMeta}>{crypto?.holdings.length ?? 0} coin{(crypto?.holdings.length ?? 0) === 1 ? '' : 's'} held</p>
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

            {loanPortfolio && (
              <Link href="/loans" className={styles.summaryCard}>
                <p className={styles.cardLabel}>Loan outstanding</p>
                <p className={styles.cardValueNegative}>₹{formatINR(loanPortfolio.total_outstanding)}</p>
                <p className={styles.cardSubNeutral}>
                  {loans.length} loan{loans.length === 1 ? '' : 's'}
                </p>
                <p className={styles.cardMeta}>
                  Monthly EMI: ₹{formatINR(loanPortfolio.total_monthly_emi)}
                </p>
                <p className={styles.cardMeta}>
                  Total interest: ₹{formatINR(loanPortfolio.total_interest)}
                </p>
              </Link>
            )}
          </div>

          {upcomingEmis.length > 0 && (
            <section className={styles.moversSection}>
              <p className={styles.sectionHeading}>Upcoming loan EMIs</p>
              <div className={styles.emiList}>
                {upcomingEmis.map((emi, i) => (
                  <Link
                    href="/loans"
                    key={`${emi.loanId}-${emi.date}`}
                    className={styles.emiRow}
                  >
                    <span className={styles.emiDate}>{formatDueDate(emi.date)}</span>
                    <span className={styles.emiName}>
                      {emi.loanName}
                      {emi.phase === 'interest_only' && (
                        <span className={styles.emiPhaseTag}>Interest-only</span>
                      )}
                    </span>
                    <span className={styles.emiAmount}>₹{formatINR(emi.amount)}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {fundRankings.best.length > 0 && (
            <section className={styles.moversSection}>
              <p className={styles.sectionHeading}>Best performing mutual funds</p>
              <div className={styles.rankGrid}>
                {fundRankings.best.map((m) => (
                  <Link href={m.href} key={`fund-best-${m.name}`} className={styles.moverCard}>
                    <span className={styles.moverName}>{m.name}</span>
                    <span className={styles.moverPctPositive}>
                      {m.gainLossPct >= 0 ? '+' : ''}{m.gainLossPct.toFixed(2)}%
                    </span>
                    <span className={styles.cardMeta}>
                      {m.gainLoss >= 0 ? '+' : ''}₹{formatINR(m.gainLoss)}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {fundRankings.worst.length > 0 && (
            <section className={styles.moversSection}>
              <p className={styles.sectionHeading}>Worst performing mutual funds</p>
              <div className={styles.rankGrid}>
                {fundRankings.worst.map((m) => (
                  <Link href={m.href} key={`fund-worst-${m.name}`} className={styles.moverCard}>
                    <span className={styles.moverName}>{m.name}</span>
                    <span className={m.gainLossPct >= 0 ? styles.moverPctPositive : styles.moverPctNegative}>
                      {m.gainLossPct >= 0 ? '+' : ''}{m.gainLossPct.toFixed(2)}%
                    </span>
                    <span className={styles.cardMeta}>
                      {m.gainLoss >= 0 ? '+' : ''}₹{formatINR(m.gainLoss)}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {(stockRankings.best || stockRankings.worst) && (
            <section className={styles.moversSection}>
              <p className={styles.sectionHeading}>Stock performance</p>
              <div className={styles.moversGrid}>
                {stockRankings.best && (
                  <Link href={stockRankings.best.href} className={styles.moverCard}>
                    <span className={styles.moverTag}>Best performing stock</span>
                    <span className={styles.moverName}>{stockRankings.best.name}</span>
                    <span className={styles.moverPctPositive}>
                      {stockRankings.best.gainLossPct >= 0 ? '+' : ''}{stockRankings.best.gainLossPct.toFixed(2)}%
                    </span>
                  </Link>
                )}
                {stockRankings.worst && (
                  <Link href={stockRankings.worst.href} className={styles.moverCard}>
                    <span className={styles.moverTag}>Worst performing stock</span>
                    <span className={styles.moverName}>{stockRankings.worst.name}</span>
                    <span
                      className={
                        stockRankings.worst.gainLossPct >= 0 ? styles.moverPctPositive : styles.moverPctNegative
                      }
                    >
                      {stockRankings.worst.gainLossPct >= 0 ? '+' : ''}{stockRankings.worst.gainLossPct.toFixed(2)}%
                    </span>
                  </Link>
                )}
              </div>
            </section>
          )}

          {(cryptoRankings.best || cryptoRankings.worst) && (
            <section className={styles.moversSection}>
              <p className={styles.sectionHeading}>Crypto performance</p>
              <div className={styles.moversGrid}>
                {cryptoRankings.best && (
                  <Link href={cryptoRankings.best.href} className={styles.moverCard}>
                    <span className={styles.moverTag}>Best performing coin</span>
                    <span className={styles.moverName}>{cryptoRankings.best.name}</span>
                    <span className={styles.moverPctPositive}>
                      {cryptoRankings.best.gainLossPct >= 0 ? '+' : ''}{cryptoRankings.best.gainLossPct.toFixed(2)}%
                    </span>
                  </Link>
                )}
                {cryptoRankings.worst && (
                  <Link href={cryptoRankings.worst.href} className={styles.moverCard}>
                    <span className={styles.moverTag}>Worst performing coin</span>
                    <span className={styles.moverName}>{cryptoRankings.worst.name}</span>
                    <span
                      className={
                        cryptoRankings.worst.gainLossPct >= 0 ? styles.moverPctPositive : styles.moverPctNegative
                      }
                    >
                      {cryptoRankings.worst.gainLossPct >= 0 ? '+' : ''}{cryptoRankings.worst.gainLossPct.toFixed(2)}%
                    </span>
                  </Link>
                )}
              </div>
            </section>
          )}

          {topExpenseHeads.length > 0 && (
            <section className={styles.moversSection}>
              <p className={styles.sectionHeading}>
                Top expense heads &middot; {expenseHeads ? formatMonthLabel(expenseHeads.period) : ''}
              </p>
              <div className={styles.expenseHeadGrid}>
                {topExpenseHeads.map((t) => (
                  <Link href="/expense-analysis" key={t.categoryId} className={styles.summaryCard}>
                    <p className={styles.cardLabel}>{t.categoryName}</p>
                    <p className={styles.cardValueNegative}>₹{formatINR(t.total)}</p>
                  </Link>
                ))}
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
