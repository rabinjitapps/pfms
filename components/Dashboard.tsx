'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { signOut } from 'next-auth/react';
import { PortfolioSummary, HoldingSummary } from '@/types';
import { xirr, CashFlow } from '@/lib/xirr';
import AddHoldingModal from './AddHoldingModal';
import TransactionModal from './TransactionModal';
import PageNav from './PageNav';
import styles from './Dashboard.module.css';

function formatINR(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatPct(n: number | null): string {
  if (n === null) return '—';
  const pct = n * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

function formatStatementDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function earliestTransactionDate(h: HoldingSummary): string | null {
  if (h.transactions.length === 0) return null;
  return h.transactions.reduce((min, t) => (t.date < min ? t.date : min), h.transactions[0].date);
}

// Calendar-accurate age breakdown (years, months, days) between two
// ISO date strings, plus the raw day count.
function fundAge(startDate: string | null, today: string): { label: string; days: number } | null {
  if (!startDate) return null;
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(today + 'T00:00:00');
  if (Number.isNaN(start.getTime())) return null;

  const days = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let dayPart = end.getDate() - start.getDate();
  if (dayPart < 0) {
    months -= 1;
    // Last day of the month before `end`'s month gives the correct days-in-month carry.
    const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
    dayPart += prevMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const parts: string[] = [];
  if (years > 0) parts.push(`${years}y`);
  if (months > 0) parts.push(`${months}m`);
  if (dayPart > 0 || parts.length === 0) parts.push(`${dayPart}d`);

  return { label: parts.join(' '), days };
}

function holdingCashFlows(h: HoldingSummary, today: string): CashFlow[] {
  const flows: CashFlow[] = h.transactions.map((t) => ({
    date: t.date,
    amount: t.type === 'BUY' ? -Number(t.amount) : Number(t.amount),
  }));
  // Treat the current value as a final "sale" today, so XIRR reflects unrealized gains too.
  if (h.currentValue > 0) {
    flows.push({ date: today, amount: h.currentValue });
  }
  return flows;
}

interface FundFlowBreakdown {
  fundId: string;
  fundName: string;
  inflow: number;
  outflow: number;
}

interface MonthlyFlow {
  month: string; // YYYY-MM
  inflow: number; // total BUY amount across all funds
  outflow: number; // total SELL amount across all funds
  net: number;
  byFund: FundFlowBreakdown[]; // sorted by total activity, descending
}

function monthlyFlowsAcrossPortfolio(portfolio: PortfolioSummary | null): MonthlyFlow[] {
  if (!portfolio) return [];
  const byMonth = new Map<
    string,
    { inflow: number; outflow: number; byFund: Map<string, FundFlowBreakdown> }
  >();

  for (const h of portfolio.holdings) {
    for (const t of h.transactions) {
      const month = t.date.slice(0, 7); // YYYY-MM
      const monthEntry = byMonth.get(month) ?? { inflow: 0, outflow: 0, byFund: new Map() };

      const fundEntry =
        monthEntry.byFund.get(h.fund.id) ??
        { fundId: h.fund.id, fundName: h.fund.name, inflow: 0, outflow: 0 };

      if (t.type === 'BUY') {
        monthEntry.inflow += Number(t.amount);
        fundEntry.inflow += Number(t.amount);
      } else {
        monthEntry.outflow += Number(t.amount);
        fundEntry.outflow += Number(t.amount);
      }

      monthEntry.byFund.set(h.fund.id, fundEntry);
      byMonth.set(month, monthEntry);
    }
  }

  return Array.from(byMonth.entries())
    .map(([month, { inflow, outflow, byFund }]) => ({
      month,
      inflow,
      outflow,
      net: inflow - outflow,
      byFund: Array.from(byFund.values()).sort(
        (a, b) => b.inflow + b.outflow - (a.inflow + a.outflow)
      ),
    }))
    .sort((a, b) => (a.month < b.month ? 1 : -1)); // newest first
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(year, m - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export default function Dashboard({ displayName }: { displayName: string }) {
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeHolding, setActiveHolding] = useState<HoldingSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/holdings');
      if (!res.ok) {
        setError('Could not load your holdings.');
        return;
      }
      const data = await res.json();
      setPortfolio(data);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the active holding's modal data fresh after a save
  useEffect(() => {
    if (activeHolding && portfolio) {
      const updated = portfolio.holdings.find((h) => h.id === activeHolding.id);
      if (updated) setActiveHolding(updated);
    }
  }, [portfolio, activeHolding?.id]);

  async function handleRefreshNav() {
    setRefreshing(true);
    setRefreshMsg('');
    try {
      const res = await fetch('/api/funds/refresh-nav', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setRefreshMsg(
          data.updated === 0
            ? 'No AMFI-linked funds to update.'
            : `Updated ${data.updated} of ${data.total} fund${data.total === 1 ? '' : 's'}.`
        );
        await load();
      } else {
        setRefreshMsg(data.error || 'Refresh failed.');
      }
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshMsg(''), 4000);
    }
  }

  async function handleDeleteHolding(id: string, name: string) {
    if (!confirm(`Remove "${name}" and all its transactions? This cannot be undone.`)) return;
    await fetch(`/api/holdings/${id}`, { method: 'DELETE' });
    load();
  }

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const fundXirr = useMemo(() => {
    const map = new Map<string, number | null>();
    if (!portfolio) return map;
    for (const h of portfolio.holdings) {
      map.set(h.id, xirr(holdingCashFlows(h, today)));
    }
    return map;
  }, [portfolio, today]);

  const portfolioXirr = useMemo(() => {
    if (!portfolio) return null;
    const allFlows = portfolio.holdings.flatMap((h) => holdingCashFlows(h, today));
    return xirr(allFlows);
  }, [portfolio, today]);

  const monthlyFlows = useMemo(() => monthlyFlowsAcrossPortfolio(portfolio), [portfolio]);

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.loadingText}>Loading your funds…</p>
      </div>
    );
  }

  const gainPositive = (portfolio?.totalGainLoss ?? 0) >= 0;

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarMain}>
          <div className={styles.brandBlock}>
            <span className={styles.eyebrow}>Statement &middot; as of {formatStatementDate(today)}</span>
            <h1 className={styles.wordmark}>PFMS Tracker</h1>
          </div>
          <div className={styles.topbarRight}>
            <span className={styles.greeting}>{displayName}</span>
            <button className={styles.signOutBtn} onClick={() => signOut({ callbackUrl: '/login' })}>
              Sign out
            </button>
          </div>
        </div>
        <PageNav active="funds" />
      </header>

      <main className={styles.main}>
        {error && <p className={styles.errorBanner}>{error}</p>}

        {portfolio && (
          <section className={styles.summaryCard}>
            <p className={styles.summaryHeading}>Account summary</p>
            <div className={styles.summaryGrid}>
              <div>
                <p className={styles.summaryLabel}>Current value</p>
                <div className={styles.totalRule}>
                  <p className={styles.summaryValue}>₹{formatINR(portfolio.currentValue)}</p>
                </div>
              </div>
              <div>
                <p className={styles.summaryLabel}>Invested</p>
                <p className={styles.summaryValueSecondary}>₹{formatINR(portfolio.totalInvested)}</p>
              </div>
              <div>
                <p className={styles.summaryLabel}>Gain / loss</p>
                <p className={gainPositive ? styles.gainPositive : styles.gainNegative}>
                  {gainPositive ? '+' : ''}₹{formatINR(portfolio.totalGainLoss)}
                  <span className={styles.gainPct}>
                    {' '}({gainPositive ? '+' : ''}{portfolio.totalGainLossPct.toFixed(2)}%)
                  </span>
                </p>
              </div>
            </div>
            <div className={styles.summaryGridSecondary}>
              <div>
                <p className={styles.summaryLabel}>Funds held</p>
                <p className={styles.summaryValueSmall}>{portfolio.holdings.length}</p>
              </div>
              <div>
                <p className={styles.summaryLabel}>XIRR (annualized)</p>
                <p
                  className={
                    portfolioXirr === null
                      ? styles.summaryValueSmall
                      : portfolioXirr >= 0
                      ? styles.xirrPositive
                      : styles.xirrNegative
                  }
                >
                  {formatPct(portfolioXirr)}
                </p>
              </div>
            </div>
          </section>
        )}

        <div className={styles.actionsRow}>
          <button className={styles.primaryBtn} onClick={() => setShowAddModal(true)}>
            + Add fund
          </button>
          <button className={styles.secondaryBtn} onClick={handleRefreshNav} disabled={refreshing}>
            {refreshing ? 'Refreshing NAVs…' : 'Refresh NAVs'}
          </button>
          {refreshMsg && <span className={styles.refreshMsg}>{refreshMsg}</span>}
        </div>

        {portfolio && portfolio.holdings.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>No holdings yet.</p>
            <p className={styles.emptyBody}>
              Add your first mutual fund to start tracking units, NAV, and gains.
            </p>
          </div>
        ) : (
          <div className={styles.holdingsList}>
            <div className={styles.ledgerHeader}>
              <span className={styles.ledgerHeaderCell}>Holding</span>
              <span className={styles.ledgerHeaderCell}>Invested</span>
              <span className={styles.ledgerHeaderCell}>Current value</span>
              <span className={styles.ledgerHeaderCell}>Gain / loss</span>
              <span className={styles.ledgerHeaderCell}>XIRR</span>
            </div>

            {portfolio?.holdings.map((h) => {
              const positive = h.gainLoss >= 0;
              const fundXirrValue = fundXirr.get(h.id) ?? null;
              const age = fundAge(earliestTransactionDate(h), today);
              return (
                <button
                  key={h.id}
                  className={styles.holdingRow}
                  onClick={() => setActiveHolding(h)}
                >
                  <div className={styles.holdingMain}>
                    <p className={styles.holdingName}>{h.fund.name}</p>
                    {h.totalUnits < -0.0001 && (
                      <p className={styles.holdingWarning}>
                        ⚠ Units gone negative ({h.totalUnits.toFixed(4)}) — a sell exceeded what
                        was held. Open History and delete the bad transaction.
                      </p>
                    )}
                    <p className={styles.holdingMeta}>
                      {h.totalUnits.toLocaleString('en-IN', { maximumFractionDigits: 4 })} units
                      {' · NAV ₹'}{(h.fund.latest_nav ?? 0).toFixed(2)}
                      {h.fund.latest_nav_date && (
                        <span className={styles.holdingDate}> as of {h.fund.latest_nav_date}</span>
                      )}
                    </p>
                    {age && (
                      <p className={styles.holdingMetaSecondary}>
                        Held {age.label} <span className={styles.holdingDate}>({age.days} days)</span>
                      </p>
                    )}
                  </div>

                  <div className={styles.figureCell}>
                    <span className={styles.figureLabel}>Invested</span>
                    <p className={styles.figureInvested}>₹{formatINR(h.investedAmount)}</p>
                  </div>

                  <div className={styles.figureCell}>
                    <span className={styles.figureLabel}>Current value</span>
                    <p className={styles.holdingValue}>₹{formatINR(h.currentValue)}</p>
                  </div>

                  <div className={styles.figureCell}>
                    <span className={styles.figureLabel}>Gain / loss</span>
                    <p className={positive ? styles.holdingGainPositive : styles.holdingGainNegative}>
                      {positive ? '+' : ''}₹{formatINR(h.gainLoss)}
                      <span className={styles.gainPctSmall}>
                        ({positive ? '+' : ''}{h.gainLossPct.toFixed(2)}%)
                      </span>
                    </p>
                  </div>

                  <div className={styles.figureCell}>
                    <span className={styles.figureLabel}>XIRR</span>
                    <p
                      className={
                        fundXirrValue === null
                          ? styles.holdingXirrValue
                          : fundXirrValue >= 0
                          ? styles.holdingXirrValuePositive
                          : styles.holdingXirrValueNegative
                      }
                    >
                      {formatPct(fundXirrValue)}
                    </p>
                  </div>

                  <span
                    className={styles.removeBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteHolding(h.id, h.fund.name);
                    }}
                  >
                    Remove
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {monthlyFlows.length > 0 && (
          <section className={styles.monthlyFlowSection}>
            <p className={styles.summaryHeading}>Monthly cash flow &middot; all funds</p>
            <div className={styles.monthlyFlowHeader}>
              <span className={styles.monthlyFlowHeaderCell}>Month</span>
              <span className={styles.monthlyFlowHeaderCell}>Inflow (buy)</span>
              <span className={styles.monthlyFlowHeaderCell}>Outflow (sell)</span>
              <span className={styles.monthlyFlowHeaderCell}>Net</span>
            </div>
            {monthlyFlows.map((m) => {
              const netPositive = m.net >= 0;
              const expanded = expandedMonth === m.month;
              return (
                <div key={m.month}>
                  <button
                    className={styles.monthlyFlowRow}
                    onClick={() => setExpandedMonth(expanded ? null : m.month)}
                    aria-expanded={expanded}
                  >
                    <span className={styles.monthlyFlowMonth}>
                      <span className={styles.monthlyFlowCaret}>{expanded ? '▾' : '▸'}</span>
                      {formatMonthLabel(m.month)}
                    </span>
                    <span className={styles.monthlyFlowInflow}>
                      {m.inflow > 0 ? `₹${formatINR(m.inflow)}` : '—'}
                    </span>
                    <span className={styles.monthlyFlowOutflow}>
                      {m.outflow > 0 ? `₹${formatINR(m.outflow)}` : '—'}
                    </span>
                    <span className={netPositive ? styles.monthlyFlowNetPositive : styles.monthlyFlowNetNegative}>
                      {netPositive ? '+' : ''}₹{formatINR(m.net)}
                    </span>
                  </button>

                  {expanded && (
                    <div className={styles.monthlyFlowBreakdown}>
                      {m.byFund.map((f) => (
                        <div key={f.fundId} className={styles.monthlyFlowBreakdownRow}>
                          <span className={styles.monthlyFlowBreakdownFund}>{f.fundName}</span>
                          <span className={styles.monthlyFlowInflow}>
                            {f.inflow > 0 ? `₹${formatINR(f.inflow)}` : '—'}
                          </span>
                          <span className={styles.monthlyFlowOutflow}>
                            {f.outflow > 0 ? `₹${formatINR(f.outflow)}` : '—'}
                          </span>
                          <span
                            className={
                              f.inflow - f.outflow >= 0
                                ? styles.monthlyFlowNetPositive
                                : styles.monthlyFlowNetNegative
                            }
                          >
                            {f.inflow - f.outflow >= 0 ? '+' : ''}₹{formatINR(f.inflow - f.outflow)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}
      </main>

      {showAddModal && (
        <AddHoldingModal onClose={() => setShowAddModal(false)} onAdded={load} />
      )}

      {activeHolding && (
        <TransactionModal
          holding={activeHolding}
          onClose={() => setActiveHolding(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
