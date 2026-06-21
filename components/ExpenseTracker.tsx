'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { signOut } from 'next-auth/react';
import { ExpenseSummary, ExpenseEntry } from '@/types';
import PageNav from './PageNav';
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

function monthBounds(month: string): { start: string; end: string } {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1;
  const start = `${month}-01`;
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  const end = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
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
  const [editingEntry, setEditingEntry] = useState<ExpenseEntry | null>(null);
  const [showHeadsModal, setShowHeadsModal] = useState(false);
  const [defaultDirection, setDefaultDirection] = useState<'INFLOW' | 'OUTFLOW'>('OUTFLOW');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [incomeHeadFilter, setIncomeHeadFilter] = useState('');
  const [expenseHeadFilter, setExpenseHeadFilter] = useState('');

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
    setFromDate('');
    setToDate('');
  }, [load, month]);

  const refresh = useCallback(() => load(month), [load, month]);

  async function handleDeleteEntry(id: string) {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    await fetch(`/api/expense-entries/${id}`, { method: 'DELETE' });
    refresh();
  }

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { start: monthStart, end: monthEnd } = useMemo(
    () => (summary ? monthBounds(summary.month) : { start: '', end: '' }),
    [summary]
  );

  const filteredEntries = useMemo(() => {
    if (!summary) return [];
    const effectiveFrom = fromDate || monthStart;
    const effectiveTo = toDate || monthEnd;
    return summary.entries.filter((e) => {
      if (e.date < effectiveFrom || e.date > effectiveTo) return false;
      if (incomeHeadFilter && (e.direction !== 'INFLOW' || e.category.id !== incomeHeadFilter)) {
        return false;
      }
      if (expenseHeadFilter && (e.direction !== 'OUTFLOW' || e.category.id !== expenseHeadFilter)) {
        return false;
      }
      return true;
    });
  }, [summary, fromDate, toDate, monthStart, monthEnd, incomeHeadFilter, expenseHeadFilter]);

  const filtersActive = Boolean(fromDate || toDate || incomeHeadFilter || expenseHeadFilter);

  const filteredInflow = useMemo(
    () => filteredEntries.filter((e) => e.direction === 'INFLOW').reduce((s, e) => s + Number(e.amount), 0),
    [filteredEntries]
  );
  const filteredOutflow = useMemo(
    () => filteredEntries.filter((e) => e.direction === 'OUTFLOW').reduce((s, e) => s + Number(e.amount), 0),
    [filteredEntries]
  );

  function clearFilters() {
    setFromDate('');
    setToDate('');
    setIncomeHeadFilter('');
    setExpenseHeadFilter('');
  }

  const groups = useMemo(() => {
    if (!summary) return [];
    return groupByDate(filteredEntries);
  }, [summary, filteredEntries]);

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
    setEditingEntry(null);
    setShowAddModal(true);
  }

  function openEdit(entry: ExpenseEntry) {
    setEditingEntry(entry);
    setDefaultDirection(entry.direction);
    setShowAddModal(true);
  }

  function closeModal() {
    setShowAddModal(false);
    setEditingEntry(null);
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
      <div className={styles.page}>
        <p className={styles.loadingText}>Loading your cashbook…</p>
      </div>
    );
  }

  const netPositive = (summary?.net ?? 0) >= 0;
  const runningBalancePositive = (summary?.netWithCarryForward ?? 0) >= 0;
  const carryForwardPositive = (summary?.carryForward ?? 0) >= 0;

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
          <MonthSwitcher
            month={summary.month}
            availableMonths={summary.availableMonths}
            onChange={setMonth}
          />
        )}

        {summary && (
          <section className={styles.summaryCard}>
            <p className={styles.summaryHeading}>Cashbook summary &middot; {formatMonthLong(summary.month)}</p>
            {summary.carryForward !== 0 && (
              <p className={styles.carryForwardLine}>
                Carried forward from previous months:{' '}
                <span className={carryForwardPositive ? styles.netPositive : styles.netNegative}>
                  {carryForwardPositive ? '+' : ''}₹{formatINR(summary.carryForward)}
                </span>
              </p>
            )}
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
                <p className={styles.summaryLabel}>Net (this month)</p>
                <p className={netPositive ? styles.netPositive : styles.netNegative}>
                  {netPositive ? '+' : ''}₹{formatINR(summary.net)}
                </p>
              </div>
            </div>
            <div className={styles.summaryGridSecondary}>
              <div>
                <p className={styles.summaryLabel}>Closing balance &middot; carried to next month</p>
                <div className={styles.totalRule}>
                  <p className={runningBalancePositive ? styles.netPositive : styles.netNegative}>
                    {runningBalancePositive ? '+' : ''}₹{formatINR(summary.netWithCarryForward)}
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

        {summary && (
          <section className={styles.filterBar}>
            <div className={styles.filterField}>
              <label className={styles.filterLabel} htmlFor="filter-from">From</label>
              <input
                id="filter-from"
                type="date"
                className={styles.filterInput}
                value={fromDate}
                min={monthStart}
                max={toDate || monthEnd}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className={styles.filterField}>
              <label className={styles.filterLabel} htmlFor="filter-to">To</label>
              <input
                id="filter-to"
                type="date"
                className={styles.filterInput}
                value={toDate}
                min={fromDate || monthStart}
                max={monthEnd}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <div className={styles.filterField}>
              <label className={styles.filterLabel} htmlFor="filter-income-head">Income head</label>
              <select
                id="filter-income-head"
                className={styles.filterSelect}
                value={incomeHeadFilter}
                onChange={(e) => setIncomeHeadFilter(e.target.value)}
              >
                <option value="">All income heads</option>
                {incomeHeads.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.filterField}>
              <label className={styles.filterLabel} htmlFor="filter-expense-head">Expense head</label>
              <select
                id="filter-expense-head"
                className={styles.filterSelect}
                value={expenseHeadFilter}
                onChange={(e) => setExpenseHeadFilter(e.target.value)}
              >
                <option value="">All expense heads</option>
                {expenseHeads.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
            {filtersActive && (
              <button className={styles.filterClearBtn} onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </section>
        )}

        {filtersActive && summary && (
          <p className={styles.filterSummary}>
            Showing {filteredEntries.length} entr{filteredEntries.length === 1 ? 'y' : 'ies'} &middot;{' '}
            <span className={styles.inflowValueInline}>+₹{formatINR(filteredInflow)}</span>
            {' / '}
            <span className={styles.outflowValueInline}>−₹{formatINR(filteredOutflow)}</span>
          </p>
        )}

        {summary && filteredEntries.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>
              {filtersActive
                ? 'No entries match these filters.'
                : `No entries for ${formatMonthLong(summary.month)}.`}
            </p>
            <p className={styles.emptyBody}>
              {filtersActive
                ? 'Try widening the date range or clearing a head filter.'
                : 'Log an income or expense entry to start tracking cash flow for this month.'}
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
                      <div className={styles.entryActions}>
                        <button
                          className={styles.editBtn}
                          onClick={() => openEdit(entry)}
                          aria-label="Edit entry"
                        >
                          Edit
                        </button>
                        <button
                          className={styles.deleteBtn}
                          onClick={() => handleDeleteEntry(entry.id)}
                          aria-label="Delete entry"
                        >
                          Delete
                        </button>
                      </div>
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
          editingEntry={editingEntry}
          onClose={closeModal}
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
  );
}
