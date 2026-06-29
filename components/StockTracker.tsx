'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { StockPortfolioSummary, StockHoldingSummary } from '@/types';
import { xirr, CashFlow } from '@/lib/xirr';
import AddStockModal from './AddStockModal';
import StockTransactionModal from './StockTransactionModal';
import AppShell from './AppShell';
import styles from './StockTracker.module.css';

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

function earliestTransactionDate(h: StockHoldingSummary): string | null {
  if (h.transactions.length === 0) return null;
  return h.transactions.reduce((min, t) => (t.date < min ? t.date : min), h.transactions[0].date);
}

// Calendar-accurate age breakdown (years, months, days) between two
// ISO date strings, plus the raw day count. Mirrors Dashboard's fundAge.
function holdingAge(startDate: string | null, today: string): { label: string; days: number } | null {
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

function holdingCashFlows(h: StockHoldingSummary, today: string): CashFlow[] {
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

export default function StockTracker({ displayName }: { displayName: string }) {
  const [portfolio, setPortfolio] = useState<StockPortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeHolding, setActiveHolding] = useState<StockHoldingSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/stock-holdings');
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

  async function handleRefreshPrice() {
    setRefreshing(true);
    setRefreshMsg('');
    try {
      const res = await fetch('/api/stocks/refresh-price', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setRefreshMsg(
          data.updated === 0
            ? 'No stocks to update.'
            : `Updated ${data.updated} of ${data.total} stock${data.total === 1 ? '' : 's'}.`
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
    await fetch(`/api/stock-holdings/${id}`, { method: 'DELETE' });
    load();
  }

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const stockXirr = useMemo(() => {
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

  if (loading) {
    return (
      <AppShell active="stocks" displayName={displayName}>
        <div className={styles.page}>
          <p className={styles.loadingText}>Loading your stocks…</p>
        </div>
      </AppShell>
    );
  }

  const gainPositive = (portfolio?.totalGainLoss ?? 0) >= 0;

  return (
    <AppShell active="stocks" displayName={displayName}>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <span className={styles.eyebrow}>Statement &middot; as of {formatStatementDate(today)}</span>
          <h2 className={styles.pageTitle}>Stocks</h2>
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
                <p className={styles.summaryLabel}>Stocks held</p>
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
            + Add stock
          </button>
          <button className={styles.secondaryBtn} onClick={handleRefreshPrice} disabled={refreshing}>
            {refreshing ? 'Refreshing prices…' : 'Refresh prices'}
          </button>
          {refreshMsg && <span className={styles.refreshMsg}>{refreshMsg}</span>}
        </div>

        {portfolio && portfolio.holdings.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>No holdings yet.</p>
            <p className={styles.emptyBody}>
              Add your first stock to start tracking quantity, price, and gains.
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
              const stockXirrValue = stockXirr.get(h.id) ?? null;
              const age = holdingAge(earliestTransactionDate(h), today);
              return (
                <button
                  key={h.id}
                  className={styles.holdingRow}
                  onClick={() => setActiveHolding(h)}
                >
                  <div className={styles.holdingMain}>
                    <p className={styles.holdingName}>
                      {h.stock.name} <span className={styles.holdingSymbol}>{h.stock.symbol}</span>
                    </p>
                    {h.totalQuantity < -0.0001 && (
                      <p className={styles.holdingWarning}>
                        ⚠ Quantity gone negative ({h.totalQuantity.toFixed(4)}) — a sell exceeded
                        what was held. Open History and delete the bad transaction.
                      </p>
                    )}
                    <p className={styles.holdingMeta}>
                      <span className={styles.holdingMetaEmphasis}>
                        {h.totalQuantity.toLocaleString('en-IN', { maximumFractionDigits: 4 })} shares
                        {' · Avg ₹'}{h.avgPrice.toFixed(2)}
                      </span>
                      {' · '}₹{(h.stock.latest_price ?? 0).toFixed(2)}
                      {h.stock.latest_price_date && (
                        <span className={styles.holdingMetaMuted}> as of {h.stock.latest_price_date}</span>
                      )}
                    </p>
                    {age && (
                      <p className={styles.holdingMetaSecondary}>
                        Held {age.label}{' '}
                        <span className={styles.holdingMetaEmphasis}>({age.days} days)</span>
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
                        stockXirrValue === null
                          ? styles.holdingXirrValue
                          : stockXirrValue >= 0
                          ? styles.holdingXirrValuePositive
                          : styles.holdingXirrValueNegative
                      }
                    >
                      {formatPct(stockXirrValue)}
                    </p>
                  </div>

                  <span
                    className={styles.removeBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteHolding(h.id, h.stock.name);
                    }}
                  >
                    Remove
                  </span>
                </button>
              );
            })}
          </div>
        )}
        </main>

        {showAddModal && (
          <AddStockModal onClose={() => setShowAddModal(false)} onAdded={load} />
        )}

        {activeHolding && (
          <StockTransactionModal
            holding={activeHolding}
            onClose={() => setActiveHolding(null)}
            onSaved={load}
          />
        )}
      </div>
    </AppShell>
  );
}
