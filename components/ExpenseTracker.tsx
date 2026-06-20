'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { signOut } from 'next-auth/react';
import { ExpenseSummary, ExpenseEntry } from '@/types';
import PageNav from './PageNav';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHeadsModal, setShowHeadsModal] = useState(false);
  const [defaultDirection, setDefaultDirection] = useState<'INFLOW' | 'OUTFLOW'>('OUTFLOW');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/expense-entries');
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
    load();
  }, [load]);

  async function handleDeleteEntry(id: string) {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    await fetch(`/api/expense-entries/${id}`, { method: 'DELETE' });
    load();
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

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.loadingText}>Loading your cashbook…</p>
      </div>
    );
  }

  const netPositive = (summary?.net ?? 0) >= 0;

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarMain}>
          <div className={styles.brandBlock}>
            <span className={styles.eyebrow}>Cashbook &middot; as of {formatStatementDate(today)}</span>
            <h1 className={styles.wordmark}>PFMS Tracker</h1>
          </div>
          <div className={styles.topbarRight}>
            <span className={styles.greeting}>{displayName}</span>
            <button className={styles.signOutBtn} onClick={() => signOut({ callbackUrl: '/login' })}>
              Sign out
            </button>
          </div>
        </div>
        <PageNav active="expenses" />
      </header>

      <main className={styles.main}>
        {error && <p className={styles.errorBanner}>{error}</p>}

        {summary && (
          <section className={styles.summaryCard}>
            <p className={styles.summaryHeading}>Cashbook summary</p>
            <div className={styles.summaryGrid}>
              <div>
                <p className={styles.summaryLabel}>Inflow</p>
                <p className={styles.inflowValue}>₹{formatINR(summary.totalInflow)}</p>
              </div>
              <div>
                <p className={styles.summaryLabel}>Outflow</p>
                <p className={styles.outflowValue}>₹{formatINR(summary.totalOutflow)}</p>
              </div>
              <div>
                <p className={styles.summaryLabel}>Net</p>
                <div className={styles.totalRule}>
                  <p className={netPositive ? styles.netPositive : styles.netNegative}>
                    {netPositive ? '+' : ''}₹{formatINR(summary.net)}
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
            <p className={styles.emptyTitle}>The cashbook is blank.</p>
            <p className={styles.emptyBody}>
              Log your first income or expense entry to start tracking daily cash flow.
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
          onSaved={load}
        />
      )}

      {showHeadsModal && (
        <ManageHeadsModal
          incomeHeads={incomeHeads}
          expenseHeads={expenseHeads}
          onClose={() => setShowHeadsModal(false)}
          onChanged={load}
        />
      )}
    </div>
  );
}
