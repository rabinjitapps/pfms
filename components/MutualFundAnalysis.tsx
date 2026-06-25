'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PortfolioSummary, FundGrowthData, FundGrowthPeriodType } from '@/types';
import AppShell from './AppShell';
import FundGrowthChart from './FundGrowthChart';
import YearSwitcher from './YearSwitcher';
import styles from './MutualFundAnalysis.module.css';

const ALL_FUNDS_ID = 'all';

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
  const [benchmarkChoice, setBenchmarkChoice] = useState<string>(''); // '' = none, 'category' = auto, or a benchmark id

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
    async (holdingId: string, forPeriodType: FundGrowthPeriodType, forYear: number, forBenchmark: string) => {
      if (!holdingId) return;
      setLoadingGrowth(true);
      setGrowthError('');
      try {
        const qs = new URLSearchParams({ periodType: forPeriodType, year: String(forYear) });
        if (forBenchmark) qs.set('benchmark', forBenchmark);
        const url =
          holdingId === ALL_FUNDS_ID
            ? `/api/holdings/portfolio-growth?${qs.toString()}`
            : `/api/holdings/${holdingId}/growth?${qs.toString()}`;
        const res = await fetch(url);
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
    if (selectedHoldingId) loadGrowth(selectedHoldingId, periodType, year, benchmarkChoice);
  }, [selectedHoldingId, periodType, year, benchmarkChoice, loadGrowth]);

  const availableYears = growth?.availableYears ?? [year];
  const latestPoint = growth && growth.points.length > 0 ? growth.points[growth.points.length - 1] : null;
  const gain = latestPoint ? latestPoint.current - latestPoint.invested : 0;
  const gainPositive = gain >= 0;

  const selectedHolding =
    selectedHoldingId === ALL_FUNDS_ID
      ? null
      : portfolio?.holdings.find((h) => h.id === selectedHoldingId) ?? null;

  const termSplit = growth?.termSplit;
  const termTotal = termSplit ? termSplit.shortTerm.currentValue + termSplit.longTerm.currentValue : 0;
  const shortPct = termTotal > 0 && termSplit ? (termSplit.shortTerm.currentValue / termTotal) * 100 : 0;
  const longPct = termTotal > 0 && termSplit ? (termSplit.longTerm.currentValue / termTotal) * 100 : 0;

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
                  {portfolio && portfolio.holdings.length > 1 && (
                    <option value={ALL_FUNDS_ID}>All funds &middot; whole investment</option>
                  )}
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

              <div className={styles.controlsRow}>
                <select
                  className={styles.benchmarkSelect}
                  value={benchmarkChoice}
                  onChange={(e) => setBenchmarkChoice(e.target.value)}
                  aria-label="Compare against benchmark"
                >
                  <option value="">No benchmark comparison</option>
                  {selectedHoldingId !== ALL_FUNDS_ID && (
                    <option value="category">Category benchmark (auto)</option>
                  )}
                  {growth?.availableBenchmarks?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              {growthError && <p className={styles.errorBanner}>{growthError}</p>}

              {(selectedHolding || selectedHoldingId === ALL_FUNDS_ID) && (
                <section className={styles.summaryCard}>
                  <div>
                    <p className={styles.summaryLabel}>Invested</p>
                    <p className={styles.summaryValueSecondary}>
                      ₹{formatINR(latestPoint?.invested ?? selectedHolding?.investedAmount ?? 0)}
                    </p>
                  </div>
                  <div>
                    <p className={styles.summaryLabel}>Current value</p>
                    <p className={styles.summaryValue}>
                      ₹{formatINR(latestPoint?.current ?? selectedHolding?.currentValue ?? 0)}
                    </p>
                  </div>
                  <div>
                    <p className={styles.summaryLabel}>Gain / loss</p>
                    <p className={gainPositive ? styles.gainPositive : styles.gainNegative}>
                      {gainPositive ? '+' : ''}₹{formatINR(gain)}
                    </p>
                  </div>
                  {selectedHoldingId !== ALL_FUNDS_ID && growth?.currentUnits !== undefined && (
                    <div>
                      <p className={styles.summaryLabel}>Available units</p>
                      <p className={styles.summaryValueSecondary}>
                        {growth.currentUnits.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
                      </p>
                    </div>
                  )}
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
                      {growth.benchmark && (
                        <span className={styles.legendItem}>
                          <span className={styles.legendDotBenchmark} /> {growth.benchmark.label}
                          {growth.benchmark.isCategoryDefault ? ' (category)' : ''}
                        </span>
                      )}
                    </div>
                    <FundGrowthChart
                      points={growth.points}
                      periodType={growth.periodType}
                      benchmarkValues={growth.benchmark?.values}
                      benchmarkLabel={growth.benchmark?.label}
                    />
                    <p className={styles.hoverHint}>Hover over the chart for the exact value on any day.</p>
                    {growth.navEstimated && (
                      <p className={styles.navNote}>
                        NAV history isn&apos;t fully available for this fund — some points use the
                        nearest known NAV instead of the exact date.
                      </p>
                    )}
                    {growth.benchmark && latestPoint && (
                      <div className={styles.benchmarkSummary}>
                        <span>
                          Your return:{' '}
                          <strong className={gainPositive ? styles.gainPositive : styles.gainNegative}>
                            {((gain / Math.max(latestPoint.invested, 1)) * 100).toFixed(1)}%
                          </strong>
                        </span>
                        <span>
                          {growth.benchmark.label} return:{' '}
                          <strong
                            className={
                              growth.benchmark.returnPct >= 0 ? styles.gainPositive : styles.gainNegative
                            }
                          >
                            {growth.benchmark.returnPct.toFixed(1)}%
                          </strong>
                        </span>
                      </div>
                    )}
                  </>
                ) : null}
              </div>

              {termSplit && termTotal > 0 && (
                <section className={styles.termCard}>
                  <p className={styles.termCardTitle}>Long term vs short term (current value)</p>
                  <div className={styles.termBar}>
                    <div className={styles.termBarLong} style={{ width: `${longPct}%` }} />
                    <div className={styles.termBarShort} style={{ width: `${shortPct}%` }} />
                  </div>
                  <div className={styles.termGrid}>
                    <div>
                      <p className={styles.termLabel}>
                        <span className={styles.legendDotLong} /> Long term (&gt;1 year)
                      </p>
                      <p className={styles.termValue}>₹{formatINR(termSplit.longTerm.currentValue)}</p>
                      <p className={styles.termSub}>
                        Invested ₹{formatINR(termSplit.longTerm.invested)} &middot;{' '}
                        {termSplit.longTerm.units.toLocaleString('en-IN', { maximumFractionDigits: 3 })} units
                      </p>
                    </div>
                    <div>
                      <p className={styles.termLabel}>
                        <span className={styles.legendDotShort} /> Short term (&lt;1 year)
                      </p>
                      <p className={styles.termValue}>₹{formatINR(termSplit.shortTerm.currentValue)}</p>
                      <p className={styles.termSub}>
                        Invested ₹{formatINR(termSplit.shortTerm.invested)} &middot;{' '}
                        {termSplit.shortTerm.units.toLocaleString('en-IN', { maximumFractionDigits: 3 })} units
                      </p>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </AppShell>
  );
}
