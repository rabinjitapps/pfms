'use client';

import { useState, useEffect, useCallback } from 'react';
import { signOut } from 'next-auth/react';
import { PortfolioSummary, HoldingSummary } from '@/types';
import AddHoldingModal from './AddHoldingModal';
import TransactionModal from './TransactionModal';

function formatINR(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export default function Dashboard({ displayName }: { displayName: string }) {
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeHolding, setActiveHolding] = useState<HoldingSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');

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

  if (loading) {
    return (
      <div style={styles.page}>
        <p style={styles.loadingText}>Loading your ledger…</p>
      </div>
    );
  }

  const gainPositive = (portfolio?.totalGainLoss ?? 0) >= 0;

  return (
    <div style={styles.page}>
      <header style={styles.topbar}>
        <div>
          <h1 style={styles.wordmark}>Ledger</h1>
        </div>
        <div style={styles.topbarRight}>
          <span style={styles.greeting}>{displayName}</span>
          <button style={styles.signOutBtn} onClick={() => signOut({ callbackUrl: '/login' })}>
            Sign out
          </button>
        </div>
      </header>

      <main style={styles.main}>
        {error && <p style={styles.errorBanner}>{error}</p>}

        {portfolio && (
          <section style={styles.summaryCard}>
            <div style={styles.summaryGrid}>
              <div>
                <p style={styles.summaryLabel}>Current value</p>
                <p style={styles.summaryValue}>₹{formatINR(portfolio.currentValue)}</p>
              </div>
              <div>
                <p style={styles.summaryLabel}>Invested</p>
                <p style={styles.summaryValueSecondary}>₹{formatINR(portfolio.totalInvested)}</p>
              </div>
              <div>
                <p style={styles.summaryLabel}>Gain / loss</p>
                <p style={gainPositive ? styles.gainPositive : styles.gainNegative}>
                  {gainPositive ? '+' : ''}₹{formatINR(portfolio.totalGainLoss)}
                  <span style={styles.gainPct}>
                    {' '}({gainPositive ? '+' : ''}{portfolio.totalGainLossPct.toFixed(2)}%)
                  </span>
                </p>
              </div>
            </div>
          </section>
        )}

        <div style={styles.actionsRow}>
          <button style={styles.primaryBtn} onClick={() => setShowAddModal(true)}>
            + Add fund
          </button>
          <button style={styles.secondaryBtn} onClick={handleRefreshNav} disabled={refreshing}>
            {refreshing ? 'Refreshing NAVs…' : 'Refresh NAVs'}
          </button>
          {refreshMsg && <span style={styles.refreshMsg}>{refreshMsg}</span>}
        </div>

        {portfolio && portfolio.holdings.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>No holdings yet.</p>
            <p style={styles.emptyBody}>
              Add your first mutual fund to start tracking units, NAV, and gains.
            </p>
          </div>
        ) : (
          <div style={styles.holdingsList}>
            {portfolio?.holdings.map((h) => {
              const positive = h.gainLoss >= 0;
              return (
                <button
                  key={h.id}
                  style={styles.holdingRow}
                  onClick={() => setActiveHolding(h)}
                >
                  <div style={styles.holdingMain}>
                    <p style={styles.holdingName}>{h.fund.name}</p>
                    <p style={styles.holdingMeta}>
                      {h.totalUnits.toLocaleString('en-IN', { maximumFractionDigits: 4 })} units
                      {' · NAV ₹'}{(h.fund.latest_nav ?? 0).toFixed(2)}
                      {h.fund.latest_nav_date && (
                        <span style={styles.holdingDate}> as of {h.fund.latest_nav_date}</span>
                      )}
                    </p>
                  </div>
                  <div style={styles.holdingFigures}>
                    <p style={styles.holdingValue}>₹{formatINR(h.currentValue)}</p>
                    <p style={positive ? styles.holdingGainPositive : styles.holdingGainNegative}>
                      {positive ? '+' : ''}₹{formatINR(h.gainLoss)} ({positive ? '+' : ''}
                      {h.gainLossPct.toFixed(2)}%)
                    </p>
                  </div>
                  <span
                    style={styles.removeBtn}
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

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--paper)',
  },
  loadingText: {
    padding: '60px 24px',
    textAlign: 'center',
    color: 'var(--ink-faint)',
    fontSize: '14px',
  },
  topbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 32px',
    borderBottom: '1px solid var(--hairline)',
    background: 'var(--paper-raised)',
  },
  wordmark: {
    fontFamily: 'var(--font-display)',
    fontSize: '24px',
    fontWeight: 600,
    color: 'var(--ink)',
    margin: 0,
    letterSpacing: '-0.01em',
  },
  topbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  greeting: {
    fontSize: '14px',
    color: 'var(--ink-soft)',
  },
  signOutBtn: {
    padding: '8px 14px',
    background: 'none',
    border: '1px solid var(--hairline)',
    borderRadius: '3px',
    fontSize: '13px',
    color: 'var(--ink-soft)',
  },
  main: {
    maxWidth: '780px',
    margin: '0 auto',
    padding: '32px 24px 80px',
  },
  errorBanner: {
    background: 'var(--brick-soft)',
    color: 'var(--brick)',
    padding: '12px 16px',
    borderRadius: '4px',
    fontSize: '14px',
    marginBottom: '20px',
  },
  summaryCard: {
    background: 'var(--paper-raised)',
    border: '1px solid var(--hairline)',
    borderRadius: '6px',
    padding: '28px',
    marginBottom: '28px',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '20px',
  },
  summaryLabel: {
    fontSize: '12px',
    color: 'var(--ink-faint)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    margin: '0 0 8px',
    fontWeight: 600,
  },
  summaryValue: {
    fontFamily: 'var(--font-display)',
    fontSize: '28px',
    fontWeight: 600,
    color: 'var(--ink)',
    margin: 0,
  },
  summaryValueSecondary: {
    fontFamily: 'var(--font-display)',
    fontSize: '28px',
    fontWeight: 600,
    color: 'var(--ink-soft)',
    margin: 0,
  },
  gainPositive: {
    fontFamily: 'var(--font-display)',
    fontSize: '28px',
    fontWeight: 600,
    color: 'var(--ledger-green)',
    margin: 0,
  },
  gainNegative: {
    fontFamily: 'var(--font-display)',
    fontSize: '28px',
    fontWeight: 600,
    color: 'var(--brick)',
    margin: 0,
  },
  gainPct: {
    fontSize: '15px',
    fontWeight: 500,
  },
  actionsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  primaryBtn: {
    padding: '11px 18px',
    background: 'var(--ledger-green)',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--paper-raised)',
  },
  secondaryBtn: {
    padding: '11px 18px',
    background: 'none',
    border: '1px solid var(--hairline)',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--ink-soft)',
  },
  refreshMsg: {
    fontSize: '13px',
    color: 'var(--ink-faint)',
  },
  emptyState: {
    border: '1px dashed var(--hairline)',
    borderRadius: '6px',
    padding: '48px 24px',
    textAlign: 'center',
  },
  emptyTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '18px',
    color: 'var(--ink)',
    margin: '0 0 8px',
    fontWeight: 600,
  },
  emptyBody: {
    fontSize: '14px',
    color: 'var(--ink-faint)',
    margin: 0,
  },
  holdingsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  holdingRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    width: '100%',
    textAlign: 'left',
    padding: '18px 20px',
    background: 'var(--paper-raised)',
    border: '1px solid var(--hairline)',
    borderRadius: '6px',
  },
  holdingMain: {
    flex: 1,
    minWidth: 0,
  },
  holdingName: {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--ink)',
    margin: '0 0 4px',
  },
  holdingMeta: {
    fontSize: '12.5px',
    color: 'var(--ink-faint)',
    margin: 0,
    fontFamily: 'var(--font-mono)',
  },
  holdingDate: {
    color: 'var(--ink-faint)',
  },
  holdingFigures: {
    textAlign: 'right',
    flexShrink: 0,
  },
  holdingValue: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--ink)',
    margin: '0 0 4px',
    fontFamily: 'var(--font-mono)',
  },
  holdingGainPositive: {
    fontSize: '12.5px',
    color: 'var(--ledger-green)',
    margin: 0,
    fontFamily: 'var(--font-mono)',
  },
  holdingGainNegative: {
    fontSize: '12.5px',
    color: 'var(--brick)',
    margin: 0,
    fontFamily: 'var(--font-mono)',
  },
  removeBtn: {
    position: 'absolute',
    top: '8px',
    right: '12px',
    fontSize: '11px',
    color: 'var(--ink-faint)',
    textDecoration: 'underline',
  },
};
