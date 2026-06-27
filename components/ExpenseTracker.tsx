'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ExpenseSummary, ExpenseEntry } from '@/types';
import AppShell from './AppShell';
import MonthSwitcher from './MonthSwitcher';
import AddExpenseModal from './AddExpenseModal';
import ManageHeadsModal from './ManageHeadsModal';
import BulkImportModal from './BulkImportModal';
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

// Last calendar day of a YYYY-MM month, as YYYY-MM-DD — used to bound the
// date filter input so it can't be set to a day outside the loaded month.
function monthEndDate(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const lastDay = new Date(year, m, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, '0')}`;
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
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string }[]>([]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHeadsModal, setShowHeadsModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ExpenseEntry | null>(null);
  const [defaultDirection, setDefaultDirection] = useState<'INFLOW' | 'OUTFLOW'>('OUTFLOW');

  // Transaction list filters — date narrows to a single day within the
  // loaded month, while the income/expense head filters narrow to one
  // category each. The two head filters are independent: picking either
  // shows just that head's entries, and picking both shows entries
  // matching either one (an entry can never match both at once, since
  // income and expense heads sit on opposite directions).
  const [filterDate, setFilterDate] = useState('');
  const [filterIncomeHead, setFilterIncomeHead] = useState('');
  const [filterExpenseHead, setFilterExpenseHead] = useState('');

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

  // Bank accounts for the "which account did this move through" picker —
  // loaded once and kept separate from the month-scoped expense summary,
  // since the account list itself doesn't change as the person browses
  // between months.
  const loadBankAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/bank-accounts');
      if (!res.ok) return;
      const data = await res.json();
      const accounts = (data.portfolio?.accounts ?? []) as { account: { id: string; name: string } }[];
      setBankAccounts(accounts.map((a) => ({ id: a.account.id, name: a.account.name })));
    } catch {
      // Non-fatal — the account picker just stays empty (entries can still
      // be saved unlinked) if this fails.
    }
  }, []);

  useEffect(() => {
    load(month);
  }, [load, month]);

  useEffect(() => {
    loadBankAccounts();
  }, [loadBankAccounts]);

  // A date/head filter picked while looking at one month rarely makes
  // sense after jumping to another, so clear them on every month change.
  useEffect(() => {
    setFilterDate('');
    setFilterIncomeHead('');
    setFilterExpenseHead('');
  }, [month]);

  const refresh = useCallback(() => load(month), [load, month]);

  async function handleDeleteEntry(id: string) {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    await fetch(`/api/expense-entries/${id}`, { method: 'DELETE' });
    refresh();
    loadBankAccounts();
  }

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const hasActiveFilters = Boolean(filterDate || filterIncomeHead || filterExpenseHead);

  const filteredEntries = useMemo(() => {
    if (!summary) return [];
    if (!hasActiveFilters) return summary.entries;
    return summary.entries.filter((entry) => {
      if (filterDate && entry.date !== filterDate) return false;

      if (filterIncomeHead || filterExpenseHead) {
        const matchesIncome =
          filterIncomeHead && entry.direction === 'INFLOW' && entry.category_id === filterIncomeHead;
        const matchesExpense =
          filterExpenseHead && entry.direction === 'OUTFLOW' && entry.category_id === filterExpenseHead;
        if (!matchesIncome && !matchesExpense) return false;
      }

      return true;
    });
  }, [summary, hasActiveFilters, filterDate, filterIncomeHead, filterExpenseHead]);

  const filteredTotals = useMemo(() => {
    const inflow = filteredEntries
      .filter((e) => e.direction === 'INFLOW')
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const outflow = filteredEntries
      .filter((e) => e.direction === 'OUTFLOW')
      .reduce((sum, e) => sum + Number(e.amount), 0);
    return { inflow, outflow };
  }, [filteredEntries]);

  function clearFilters() {
    setFilterDate('');
    setFilterIncomeHead('');
    setFilterExpenseHead('');
  }

  const groups = useMemo(() => groupByDate(filteredEntries), [filteredEntries]);

  const incomeHeads = useMemo(
    () => (summary?.categories ?? []).filter((c) => c.kind === 'INCOME'),
    [summary]
  );
  const expenseHeads = useMemo(
    () => (summary?.categories ?? []).filter((c) => c.kind === 'EXPENSE'),
    [summary]
  );

  function openAdd(direction: 'INFLOW' | 'OUTFLOW') {
    setEditingEntry(null);
    setDefaultDirection(direction);
    setShowAddModal(true);
  }

  function handleEditEntry(entry: ExpenseEntry) {
    setEditingEntry(entry);
    setShowAddModal(true);
  }

  function closeAddModal() {
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
    loadBankAccounts();
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

  const netWithCarryForwardPositive = (summary?.netWithCarryForward ?? 0) >= 0;
  const broughtForwardPositive = (summary?.carryForward ?? 0) >= 0;

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
                <span className={styles.summaryLabel}>Brought forward</span>
                <span className={broughtForwardPositive ? styles.broughtForwardPositive : styles.broughtForwardNegative}>
                  {broughtForwardPositive ? '+' : '−'}₹{formatINR(Math.abs(summary.carryForward))}
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
                  <p className={netWithCarryForwardPositive ? styles.netPositive : styles.netNegative}>
                    {netWithCarryForwardPositive ? '+' : '−'}₹{formatINR(Math.abs(summary.netWithCarryForward))}
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
          <button className={styles.secondaryBtn} onClick={() => setShowBulkModal(true)}>
            Bulk import
          </button>
        </div>

        {summary && summary.entries.length > 0 && (
          <div className={styles.filterBar}>
            <label className={styles.filterField}>
              <span className={styles.filterLabel}>Date</span>
              <input
                type="date"
                className={styles.filterInput}
                value={filterDate}
                min={`${summary.month}-01`}
                max={monthEndDate(summary.month)}
                onChange={(e) => setFilterDate(e.target.value)}
                aria-label="Filter by date"
              />
            </label>

            <label className={styles.filterField}>
              <span className={styles.filterLabel}>Income head</span>
              <select
                className={styles.filterSelect}
                value={filterIncomeHead}
                onChange={(e) => setFilterIncomeHead(e.target.value)}
                aria-label="Filter by income head"
              >
                <option value="">All income heads</option>
                {incomeHeads.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.filterField}>
              <span className={styles.filterLabel}>Expense head</span>
              <select
                className={styles.filterSelect}
                value={filterExpenseHead}
                onChange={(e) => setFilterExpenseHead(e.target.value)}
                aria-label="Filter by expense head"
              >
                <option value="">All expense heads</option>
                {expenseHeads.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            {hasActiveFilters && (
              <button className={styles.clearFiltersBtn} onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        )}

        {hasActiveFilters && (
          <div className={styles.filterSummary}>
            <span>
              {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'} matched
            </span>
            <span className={styles.filterSummaryTotals}>
              {filteredTotals.inflow > 0 && (
                <span className={styles.dayInflow}>+₹{formatINR(filteredTotals.inflow)}</span>
              )}
              {filteredTotals.outflow > 0 && (
                <span className={styles.dayOutflow}>−₹{formatINR(filteredTotals.outflow)}</span>
              )}
            </span>
          </div>
        )}

        {summary && summary.entries.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>No entries for {formatMonthLong(summary.month)}.</p>
            <p className={styles.emptyBody}>
              Log an income or expense entry to start tracking cash flow for this month.
            </p>
          </div>
        ) : groups.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>No entries match these filters.</p>
            <p className={styles.emptyBody}>Try a different date or head, or clear the filters.</p>
            <button className={styles.clearFiltersBtnCentered} onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        ) : (
          <div className={styles.entriesScroll}>
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
                          {entry.account?.name && (
                            <span className={styles.entryNotes}>via {entry.account.name}</span>
                          )}
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
                            onClick={() => handleEditEntry(entry)}
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
          </div>
        )}
        </main>

        {showAddModal && (
          <AddExpenseModal
            categories={summary?.categories ?? []}
            bankAccounts={bankAccounts}
            defaultDirection={defaultDirection}
            editingEntry={editingEntry}
            onClose={closeAddModal}
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

        {showBulkModal && (
          <BulkImportModal
            onClose={() => setShowBulkModal(false)}
            onImported={refresh}
          />
        )}
      </div>
    </AppShell>
  );
}
