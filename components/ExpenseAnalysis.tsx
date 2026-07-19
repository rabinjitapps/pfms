'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ExpenseAnalysis as ExpenseAnalysisData, AnalysisPeriodType, ExpenseDirection, ExpenseHeadTotal } from '@/types';
import AppShell from './AppShell';
import HeadBarChart from './HeadBarChart';
import ExpenseHeadBreakdownModal from './ExpenseHeadBreakdownModal';
import AIAnalysisPanel from './AIAnalysisPanel';
import styles from './ExpenseAnalysis.module.css';

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

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(year, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ExpenseAnalysis({ displayName }: { displayName: string }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [periodType, setPeriodType] = useState<AnalysisPeriodType>('month');
  const [direction, setDirection] = useState<ExpenseDirection>('OUTFLOW');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [year, setYear] = useState(() => new Date().getFullYear().toString());

  const [data, setData] = useState<ExpenseAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedHead, setSelectedHead] = useState<ExpenseHeadTotal | null>(null);

  const period = periodType === 'year' ? year : month;

  const load = useCallback(async (forPeriodType: AnalysisPeriodType, forPeriod: string, forDirection: ExpenseDirection) => {
    setError('');
    try {
      const res = await fetch(
        `/api/expense-analysis?periodType=${forPeriodType}&period=${forPeriod}&direction=${forDirection}`
      );
      if (!res.ok) {
        setError('Could not load analysis.');
        return;
      }
      const json = await res.json();
      setData(json);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(periodType, period, direction);
    // Close any open head breakdown when the period/direction changes —
    // otherwise it would keep showing entries for whatever was selected
    // under the previous period.
    setSelectedHead(null);
  }, [load, periodType, period, direction]);

  const availableYears = data?.availableYears ?? [];
  const minYear = availableYears[0] ?? year;
  const maxYear = availableYears[availableYears.length - 1] ?? year;
  const canGoPrevYear = year > minYear;
  const canGoNextYear = year < maxYear;

  function handlePeriodTypeChange(next: AnalysisPeriodType) {
    setPeriodType(next);
  }

  const maxTotal = useMemo(() => {
    if (!data || data.totals.length === 0) return 0;
    return Math.max(...data.totals.map((t) => t.total));
  }, [data]);

  const buildExpensesPayload = useCallback(() => {
    if (!data || data.totals.length === 0) return null;
    return {
      periodLabel: periodType === 'year' ? year : formatMonthLabel(month),
      direction: data.direction,
      grandTotal: data.grandTotal,
      totals: data.totals.map((t) => ({ categoryName: t.categoryName, total: t.total })),
    };
  }, [data, periodType, year, month]);

  return (
    <AppShell active="analysis" displayName={displayName}>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <span className={styles.eyebrow}>Analysis &middot; as of {formatStatementDate(today)}</span>
          <h2 className={styles.pageTitle}>Expense Analysis</h2>
        </header>

        <main className={styles.main}>
          {error && <p className={styles.errorBanner}>{error}</p>}

          <div className={styles.controlsRow}>
            <div className={styles.periodTypeToggle}>
              <button
                className={periodType === 'month' ? styles.toggleBtnActive : styles.toggleBtn}
                onClick={() => handlePeriodTypeChange('month')}
              >
                Month
              </button>
              <button
                className={periodType === 'year' ? styles.toggleBtnActive : styles.toggleBtn}
                onClick={() => handlePeriodTypeChange('year')}
              >
                Year
              </button>
            </div>

            {periodType === 'month' ? (
              <div className={styles.periodSwitcher}>
                <button
                  className={styles.arrowBtn}
                  onClick={() => setMonth((m) => shiftMonth(m, -1))}
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <span className={styles.periodLabel}>{formatMonthLabel(month)}</span>
                <button
                  className={styles.arrowBtn}
                  onClick={() => setMonth((m) => shiftMonth(m, 1))}
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>
            ) : (
              <div className={styles.periodSwitcher}>
                <button
                  className={styles.arrowBtn}
                  onClick={() => setYear((y) => String(Number(y) - 1))}
                  disabled={!canGoPrevYear}
                  aria-label="Previous year"
                >
                  ‹
                </button>
                <span className={styles.periodLabel}>{year}</span>
                <button
                  className={styles.arrowBtn}
                  onClick={() => setYear((y) => String(Number(y) + 1))}
                  disabled={!canGoNextYear}
                  aria-label="Next year"
                >
                  ›
                </button>
              </div>
            )}

            <div className={styles.directionToggle}>
              <button
                className={direction === 'OUTFLOW' ? styles.dirBtnActiveOut : styles.dirBtn}
                onClick={() => setDirection('OUTFLOW')}
              >
                Expense heads
              </button>
              <button
                className={direction === 'INFLOW' ? styles.dirBtnActiveIn : styles.dirBtn}
                onClick={() => setDirection('INFLOW')}
              >
                Income heads
              </button>
            </div>
          </div>

          {loading ? (
            <p className={styles.loadingText}>Loading analysis…</p>
          ) : data && data.totals.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>
                No {direction === 'INFLOW' ? 'income' : 'expense'} entries for{' '}
                {periodType === 'year' ? year : formatMonthLabel(month)}.
              </p>
              <p className={styles.emptyBody}>Try a different period or direction.</p>
            </div>
          ) : data ? (
            <>
              <div className={styles.totalCard}>
                <span className={styles.totalLabel}>
                  Total {direction === 'INFLOW' ? 'income' : 'expense'}
                </span>
                <span className={direction === 'INFLOW' ? styles.totalValueIn : styles.totalValueOut}>
                  ₹{formatINR(data.grandTotal)}
                </span>
              </div>

              <div className={styles.chartCard}>
                <HeadBarChart totals={data.totals} maxTotal={maxTotal} direction={direction} />
              </div>

              <div className={styles.breakdownList}>
                {data.totals.map((t) => {
                  const pct = data.grandTotal > 0 ? (t.total / data.grandTotal) * 100 : 0;
                  return (
                    <button
                      key={t.categoryId}
                      type="button"
                      className={styles.breakdownRow}
                      onClick={() => setSelectedHead(t)}
                    >
                      <span className={styles.breakdownName}>{t.categoryName}</span>
                      <span className={styles.breakdownPct}>{pct.toFixed(1)}%</span>
                      <span
                        className={
                          direction === 'INFLOW' ? styles.breakdownAmountIn : styles.breakdownAmountOut
                        }
                      >
                        ₹{formatINR(t.total)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          {data && data.totals.length > 0 && (
            <AIAnalysisPanel
              area="expenses"
              buildPayload={buildExpensesPayload}
              resetKey={`${periodType}-${period}-${direction}`}
            />
          )}
        </main>

        {selectedHead && (
          <ExpenseHeadBreakdownModal
            categoryId={selectedHead.categoryId}
            categoryName={selectedHead.categoryName}
            periodType={periodType}
            period={period}
            direction={direction}
            periodLabel={periodType === 'year' ? year : formatMonthLabel(month)}
            onClose={() => setSelectedHead(null)}
          />
        )}
      </div>
    </AppShell>
  );
}
