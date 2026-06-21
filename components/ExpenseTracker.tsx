'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ExpenseSummary, ExpenseEntry } from '@/types';
import AppShell from './AppShell';
import MonthSwitcher from './MonthSwitcher';
import AddExpenseModal from './AddExpenseModal';
import ManageHeadsModal from './ManageHeadsModal';
import styles from './ExpenseTracker.module.css';

function formatINR(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatStatementDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatEntryDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMonthLong(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(year, m - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

// Groups entries (already sorted newest-first by the API) under their date,
// the way a cashbook lists every line for a day before moving to the next.
function groupByDate(entries: ExpenseEntry[]): { date: string; entries: ExpenseEntry[] }[] {
  const groups: { date: string; entries: ExpenseEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === entry.date) {
      last.entries.push(entry);
    } else {
      groups.push({ date: entry.date, entries: [entry] });
    }
  }
  return groups;
}

export default function ExpenseTracker({ displayName }: { displayName: string }) {
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHeadsModal, setShowHeadsModal] = useState(false);
  const [defaultDirection, setDefaultDirection] = useState<'INFLOW' | 'OUTFLOW'>('OUTFLOW');

  const load = useCallback(async (forMonth: string) => {
    setError('');
    try {
      const res = await fetch(`/api/expense-entries?month=${forMonth}`);
      if (!res.ok) {
        setError('Could not load your entries.');
        return;
      }
      const data = await res.json();
      setSummary(data);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(month);
  }, [load, month]);

  const refresh = useCallback(() => load(month), [load, month]);

  async function handleDeleteEntry(id: string) {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    await fetch(`/api/expense-entries/${id}`, { method: 'DELETE' });
    refresh();
  }

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const groups = useMemo(() => {
    if (!summary) return [];
    return groupByDate(summary.entries);
  }, [summary]);

  const incomeHeads = useMemo(
    () => (summary?.categories ?? []).filter((c) => c.kind === 'INCOME'),
    [summary]
  );
  const expenseHeads = useMemo(
    () => (summary?.categories ?? []).filter((c) => c.kind === 'EXPENSE'),
    [summary]
  );

  function openAdd(direction: 'INFLOW' | 'OUTFLOW') {
    setDefaultDirection(direction);
    setShowAddModal(true);
  }

  // After saving an entry, jump to whichever month it was actually dated
  // in — otherwise an entry backdated (or postdated) outside the month
  // currently being viewed would seem to vanish.
  function handleEntrySaved(entryDate: string) {
    const entryMonth = entryDate.slice(0, 7);
    if (entryMonth !== month) {
      setMonth(entryMonth);
    } else {
      refresh();
    }
  }

  if (loading) {
    return (
      <AppShell active="expenses" displayName={displayName}>
        <div className={styles.page}>
          <p className={styles.loadingText}>Loading your cashbook…</p>
        </div>
      </AppShell>
    );
  }

  const closingPositive = (summary?.netWithCarryForward ?? 0) >= 0;
  const carryForwardPositive = (summary?.carryForward ?? 0) >= 0;

  return (
    <AppShell active="expenses" displayName={displayName}>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <span className={styles.eyebrow}>Cashbook &middot; as of {formatStatementDate(today)}</span>
          <h2 className={styles.pageTitle}>Expenses</h2>
        </header>

        <main className={styles.main}>
          {error && <p className={styles.errorBanner}>{error}</p>}

          {summary && (
            <MonthSwitcher
              month={summary.month}
              availableMonths={summary.availableMonths}
              onChange={setMonth}
            />
          )}

          {summary && (
            <section className={styles.summaryCard}>
              <p className={styles.summaryHeading}>Cashbook summary &middot; {formatMonthLong(summary.month)}</p>

              <div className={styles.broughtForwardRow}>
                <span className={styles.summaryLabel}>Carried forward</span>
                <span className={carryForwardPositive ? styles.broughtForwardPositive : styles.broughtForwardNegative}>
                  {carryForwardPositive ? '+' : '−'}₹{formatINR(Math.abs(summary.carryForward))}
                </span>
            </div>

            <div className={styles.summaryGrid}>
              <div>
                <p className={styles.summaryLabel}>Inflow this month</p>
                <p className={styles.inflowValue}>₹{formatINR(summary.totalInflow)}</p>
              </div>
              <div>
                <p className={styles.summaryLabel}>Outflow this month</p>
                <p className={styles.outflowValue}>₹{formatINR(summary.totalOutflow)}</p>
              </div>
              <div>
                <p className={styles.summaryLabel}>Closing balance</p>
                <div className={styles.totalRule}>
                  <p className={closingPositive ? styles.netPositive : styles.netNegative}>
                    {closingPositive ? '+' : '−'}₹{formatINR(Math.abs(summary.netWithCarryForward))}
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        <div className={styles.actionsRow}>
          <button className={styles.inflowBtn} onClick={() => openAdd('INFLOW')}>
            + Income
          </button>
          <button className={styles.outflowBtn} onClick={() => openAdd('OUTFLOW')}>
            + Expense
          </button>
          <button className={styles.secondaryBtn} onClick={() => setShowHeadsModal(true)}>
            Manage heads
          </button>
        </div>

        {summary && summary.entries.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>No entries for {formatMonthLong(summary.month)}.</p>
            <p className={styles.emptyBody}>
              Log an income or expense entry to start tracking cash flow for this month.
            </p>
          </div>
        ) : (
          <div className={styles.entriesList}>
            {groups.map((group) => {
              const dayInflow = group.entries
                .filter((e) => e.direction === 'INFLOW')
                .reduce((sum, e) => sum + Number(e.amount), 0);
              const dayOutflow = group.entries
                .filter((e) => e.direction === 'OUTFLOW')
                .reduce((sum, e) => sum + Number(e.amount), 0);

              return (
                <div key={group.date} className={styles.dayGroup}>
                  <div className={styles.dayHeader}>
                    <span className={styles.dayDate}>{formatEntryDate(group.date)}</span>
                    <span className={styles.dayTotals}>
                      {dayInflow > 0 && <span className={styles.dayInflow}>+₹{formatINR(dayInflow)}</span>}
                      {dayOutflow > 0 && <span className={styles.dayOutflow}>−₹{formatINR(dayOutflow)}</span>}
                    </span>
                  </div>
                  {group.entries.map((entry) => (
                    <div key={entry.id} className={styles.entryRow}>
                      <div className={styles.entryMain}>
                        <span
                          className={
                            entry.direction === 'INFLOW' ? styles.tagInflow : styles.tagOutflow
                          }
                        >
                          {entry.direction === 'INFLOW' ? 'In' : 'Out'}
                        </span>
                        <span className={styles.entryHead}>{entry.category.name}</span>
                        {entry.notes && <span className={styles.entryNotes}>{entry.notes}</span>}
                      </div>
                      <span
                        className={
                          entry.direction === 'INFLOW' ? styles.entryAmountIn : styles.entryAmountOut
                        }
                      >
                        {entry.direction === 'INFLOW' ? '+' : '−'}₹{formatINR(Number(entry.amount))}
                      </span>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDeleteEntry(entry.id)}
                        aria-label="Delete entry"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
        </main>

        {showAddModal && (
          <AddExpenseModal
            categories={summary?.categories ?? []}
            defaultDirection={defaultDirection}
            onClose={() => setShowAddModal(false)}
            onSaved={handleEntrySaved}
          />
        )}

        {showHeadsModal && (
          <ManageHeadsModal
            incomeHeads={incomeHeads}
            expenseHeads={expenseHeads}
            onClose={() => setShowHeadsModal(false)}
            onChanged={refresh}
          />
        )}
      </div>
    </AppShell>
  );
}
