'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PortfolioSummary, FundGrowthData, FundGrowthPeriodType } from '@/types';
import AppShell from './AppShell';
import FundGrowthChart from './FundGrowthChart';
import YearSwitcher from './YearSwitcher';
import styles from './MutualFundAnalysis.module.css';

function formatINR(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatStatementDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MutualFundAnalysis({ displayName }: { displayName: string }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [loadingFunds, setLoadingFunds] = useState(true);
  const [error, setError] = useState('');

  const [selectedHoldingId, setSelectedHoldingId] = useState<string>('');
  const [periodType, setPeriodType] = useState<FundGrowthPeriodType>('month');
  const [year, setYear] = useState(currentYear);

  const [growth, setGrowth] = useState<FundGrowthData | null>(null);
  const [loadingGrowth, setLoadingGrowth] = useState(false);
  const [growthError, setGrowthError] = useState('');

  // Load the fund list once, then default to the largest holding.
  useEffect(() => {
    (async () => {
      setError('');
      try {
        const res = await fetch('/api/holdings');
        if (!res.ok) {
          setError('Could not load your funds.');
          return;
        }
        const data: PortfolioSummary = await res.json();
        setPortfolio(data);
        if (data.holdings.length > 0) {
          setSelectedHoldingId(data.holdings[0].id);
        }
      } catch {
        setError('Could not reach the server.');
      } finally {
        setLoadingFunds(false);
      }
    })();
  }, []);

  const loadGrowth = useCallback(
    async (holdingId: string, forPeriodType: FundGrowthPeriodType, forYear: number) => {
      if (!holdingId) return;
      setLoadingGrowth(true);
      setGrowthError('');
      try {
        const qs = new URLSearchParams({ periodType: forPeriodType, year: String(forYear) });
        const res = await fetch(`/api/holdings/${holdingId}/growth?${qs.toString()}`);
        if (!res.ok) {
          setGrowthError('Could not load growth data for this fund.');
          return;
        }
        const data: FundGrowthData = await res.json();
        setGrowth(data);
      } catch {
        setGrowthError('Could not reach the server.');
      } finally {
        setLoadingGrowth(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedHoldingId) loadGrowth(selectedHoldingId, periodType, year);
  }, [selectedHoldingId, periodType, year, loadGrowth]);

  const availableYears = growth?.availableYears ?? [year];
  const latestPoint = growth && growth.points.length > 0 ? growth.points[growth.points.length - 1] : null;
  const gain = latestPoint ? latestPoint.current - latestPoint.invested : 0;
  const gainPositive = gain >= 0;

  const selectedHolding = portfolio?.holdings.find((h) => h.id === selectedHoldingId) ?? null;

  if (loadingFunds) {
    return (
      <AppShell active="fund-analysis" displayName={displayName}>
        <div className={styles.page}>
          <p className={styles.loadingText}>Loading your funds…</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell active="fund-analysis" displayName={displayName}>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <span className={styles.eyebrow}>Analysis &middot; as of {formatStatementDate(today)}</span>
          <h2 className={styles.pageTitle}>Mutual Fund Analysis</h2>
        </header>

        <main className={styles.main}>
          {error && <p className={styles.errorBanner}>{error}</p>}

          {portfolio && portfolio.holdings.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>No funds to analyze yet.</p>
              <p className={styles.emptyBody}>
                Add a fund and a few transactions on the Funds page, then come back here to see its
                growth over time.
              </p>
            </div>
          ) : (
            <>
              <div className={styles.controlsRow}>
                <select
                  className={styles.fundSelect}
                  value={selectedHoldingId}
                  onChange={(e) => setSelectedHoldingId(e.target.value)}
                  aria-label="Select fund"
                >
                  {portfolio?.holdings.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.fund.name}
                    </option>
                  ))}
                </select>

                <div className={styles.periodTypeToggle}>
                  <button
                    className={periodType === 'month' ? styles.toggleBtnActive : styles.toggleBtn}
                    onClick={() => setPeriodType('month')}
                  >
                    Monthly
                  </button>
                  <button
                    className={periodType === 'year' ? styles.toggleBtnActive : styles.toggleBtn}
                    onClick={() => setPeriodType('year')}
                  >
                    Yearly
                  </button>
                </div>

                {periodType === 'month' && (
                  <YearSwitcher year={year} availableYears={availableYears} onChange={setYear} />
                )}
              </div>

              {growthError && <p className={styles.errorBanner}>{growthError}</p>}

              {selectedHolding && (
                <section className={styles.summaryCard}>
                  <div>
                    <p className={styles.summaryLabel}>Invested</p>
                    <p className={styles.summaryValueSecondary}>
                      ₹{formatINR(latestPoint?.invested ?? selectedHolding.investedAmount)}
                    </p>
                  </div>
                  <div>
                    <p className={styles.summaryLabel}>Current value</p>
                    <p className={styles.summaryValue}>
                      ₹{formatINR(latestPoint?.current ?? selectedHolding.currentValue)}
                    </p>
                  </div>
                  <div>
                    <p className={styles.summaryLabel}>Gain / loss</p>
                    <p className={gainPositive ? styles.gainPositive : styles.gainNegative}>
                      {gainPositive ? '+' : ''}₹{formatINR(gain)}
                    </p>
                  </div>
                </section>
              )}

              <div className={styles.chartCard}>
                {loadingGrowth ? (
                  <p className={styles.loadingText}>Loading chart…</p>
                ) : growth && growth.points.length === 0 ? (
                  <p className={styles.loadingText}>
                    No transactions yet for {periodType === 'year' ? 'any year' : year}.
                  </p>
                ) : growth ? (
                  <>
                    <div className={styles.legend}>
                      <span className={styles.legendItem}>
                        <span className={styles.legendDotInvested} /> Invested amount
                      </span>
                      <span className={styles.legendItem}>
                        <span className={styles.legendDotCurrent} /> Current value
                      </span>
                    </div>
                    <FundGrowthChart points={growth.points} periodType={growth.periodType} />
                    {growth.navEstimated && (
                      <p className={styles.navNote}>
                        NAV history isn&apos;t fully available for this fund — some points use the
                        nearest known NAV instead of the exact date.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            </>
          )}
        </main>
      </div>
    </AppShell>
  );
}
