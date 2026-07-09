'use client';

import { useState, useEffect, useCallback } from 'react';
import AppShell from './AppShell';
import AddLoanModal from './AddLoanModal';
import styles from './LoanTracker.module.css';
import { Loan, LoanSummary } from '@/types';
import { buildPortfolioSummary } from '@/lib/loanSchedule';

// ── helpers ──────────────────────────────────────────────────────────────────
// buildLoanSummary / buildPortfolioSummary now live in lib/loanSchedule.ts so
// the Dashboard overview page can reuse the exact same EMI schedule rules.

function fmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtCurrency(n: number): string {
  return '₹' + fmt(n);
}

function debtFreeLabel(months: number): string {
  if (months <= 0) return 'Debt free!';
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [];
  if (y > 0) parts.push(`${y}y`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(' ');
}

// Calendar-accurate years/months/days countdown to a target ISO date,
// used for the portfolio-wide debt-free countdown where day-level
// precision matters more than the per-loan month-level estimate.
function timeUntil(targetIso: string): { label: string; days: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetIso);
  target.setHours(0, 0, 0, 0);

  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (days <= 0) return { label: 'Debt free!', days: 0 };

  let years = target.getFullYear() - today.getFullYear();
  let months = target.getMonth() - today.getMonth();
  let dayPart = target.getDate() - today.getDate();
  if (dayPart < 0) {
    months -= 1;
    const prevMonth = new Date(target.getFullYear(), target.getMonth(), 0);
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

// ── sub-components ────────────────────────────────────────────────────────────

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className={styles.progressTrack}>
      <div
        className={styles.progressFill}
        style={{ width: `${Math.min(100, pct)}%`, background: color }}
      />
    </div>
  );
}

function MonthlyScheduleTable({
  schedule,
  onToggle,
  togglingMonth,
}: {
  schedule: LoanSummary['emi_schedule'];
  onToggle: (month: string, nextPaid: boolean) => void;
  togglingMonth: string | null;
}) {
  // Group by year
  const years: Record<string, LoanSummary['emi_schedule']> = {};
  for (const s of schedule) {
    const y = s.month.slice(0, 4);
    if (!years[y]) years[y] = [];
    years[y].push(s);
  }

  return (
    <div className={styles.scheduleWrap}>
      {Object.entries(years).map(([year, months]) => {
        const yearTotal = months.reduce((sum, m) => sum + m.emi_amount, 0);
        return (
          <div key={year} className={styles.scheduleYear}>
            <div className={styles.scheduleYearHeader}>
              <span>{year}</span>
              <span className={styles.scheduleYearTotal}>{fmtCurrency(yearTotal)}</span>
            </div>
            <div className={styles.scheduleGrid}>
              {months.map((m) => {
                const monthName = new Date(m.month + '-01').toLocaleString('en-IN', { month: 'short' });
                // An auto-paid month (date already in the past) can't be un-toggled —
                // only current/future months are manually togglable.
                const autoLocked = m.is_paid && !m.manually_paid;
                const isToggling = togglingMonth === m.month;
                return (
                  <button
                    key={m.month}
                    type="button"
                    disabled={autoLocked || isToggling}
                    onClick={() => onToggle(m.month, !m.is_paid)}
                    title={
                      autoLocked
                        ? 'Already counted as paid'
                        : m.is_paid
                        ? 'Click to unmark as paid'
                        : 'Click to mark as paid'
                    }
                    className={
                      (m.is_paid
                        ? styles.scheduleCell + ' ' + styles.schedulePaid
                        : m.is_future
                        ? styles.scheduleCell + ' ' + styles.scheduleFuture
                        : styles.scheduleCell + ' ' + styles.scheduleCurrent) +
                      (m.phase === 'interest_only' ? ' ' + styles.scheduleInterestOnly : '')
                    }
                    style={{
                      cursor: autoLocked ? 'default' : 'pointer',
                      opacity: isToggling ? 0.5 : 1,
                      width: '100%',
                      textAlign: 'left',
                      font: 'inherit',
                      color: 'inherit',
                    }}
                  >
                    <span className={styles.scheduleCellMonth}>
                      {monthName}
                      {m.phase === 'interest_only' && (
                        <span className={styles.ioBadge} title="Interest-only">IO</span>
                      )}
                    </span>
                    <span className={styles.scheduleCellAmount}>{fmtCurrency(m.emi_amount)}</span>
                    <span className={styles.scheduleCellBreakdown}>
                      {m.phase === 'interest_only' ? (
                        <>all interest</>
                      ) : (
                        <>
                          {fmtCurrency(m.principal_component)} P + {fmtCurrency(m.interest_component)} I
                        </>
                      )}
                    </span>
                    <span className={styles.scheduleCellStatus}>
                      {m.manually_paid
                        ? '✓ paid (manual)'
                        : m.is_paid
                        ? '✓ paid'
                        : m.is_future
                        ? 'upcoming'
                        : 'current'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OpenLoanSection({
  loan,
  summary,
  expanded,
  onToggleExpanded,
  onRecorded,
}: {
  loan: Loan;
  summary: LoanSummary;
  expanded: boolean;
  onToggleExpanded: () => void;
  onRecorded: () => void;
}) {
  const [entryType, setEntryType] = useState<'interest_only' | 'payment'>('interest_only');
  const [amount, setAmount] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const currentInterestDue = summary.current_interest_due ?? 0;
  const ledger = summary.ledger ?? [];

  const handleRecord = async () => {
    setFormError(null);
    if (entryType === 'payment' && (!amount || Number(amount) <= 0)) {
      setFormError('Enter a payment amount.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/loans/${loan.id}/ledger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_type: entryType,
          amount: entryType === 'payment' ? Number(amount) : undefined,
          entry_date: entryDate,
          month: entryDate.slice(0, 7),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Failed to record payment.');
        return;
      }
      setAmount('');
      onRecorded();
    } catch {
      setFormError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = async (entryId: string) => {
    if (!confirm('Undo this payment entry? This will recompute the outstanding balance.')) return;
    setUndoingId(entryId);
    try {
      const res = await fetch(`/api/loans/${loan.id}/ledger?entry_id=${encodeURIComponent(entryId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Request failed');
      onRecorded();
    } catch {
      alert('Failed to undo that entry. Please try again.');
    } finally {
      setUndoingId(null);
    }
  };

  return (
    <div>
      <div className={styles.openBalanceCard}>
        <div>
          <div className={styles.openBalanceLabel}>Outstanding Balance</div>
          <div className={styles.openBalanceValue}>{fmtCurrency(summary.outstanding_principal)}</div>
        </div>
        {!summary.is_closed && (
          <div className={styles.openInterestHint}>
            Interest accruing at {fmtCurrency(currentInterestDue)}/mo on the current balance
          </div>
        )}
      </div>

      {!summary.is_closed && (
        <div className={styles.recordPaymentForm}>
          <div className={styles.recordPaymentRow}>
            <div className={styles.recordPaymentField}>
              <label className={styles.metricLabel}>Type</label>
              <select
                className={styles.recordPaymentInput}
                value={entryType}
                onChange={(e) => setEntryType(e.target.value as 'interest_only' | 'payment')}
              >
                <option value="interest_only">Interest only ({fmtCurrency(currentInterestDue)})</option>
                <option value="payment">EMI (interest + principal)</option>
              </select>
            </div>
            {entryType === 'payment' && (
              <div className={styles.recordPaymentField}>
                <label className={styles.metricLabel}>Amount (₹)</label>
                <input
                  className={styles.recordPaymentInput}
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="e.g. 15000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            )}
            <div className={styles.recordPaymentField}>
              <label className={styles.metricLabel}>Date</label>
              <input
                className={styles.recordPaymentInput}
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>
            <button className={styles.recordPaymentBtn} onClick={handleRecord} disabled={saving}>
              {saving ? 'Recording…' : 'Record Payment'}
            </button>
          </div>
          {formError && <div className={styles.errorBanner}>{formError}</div>}
        </div>
      )}

      <button
        className={styles.toggleSchedule}
        onClick={onToggleExpanded}
        aria-expanded={expanded}
      >
        {expanded ? 'Hide payment history ▲' : `Show payment history (${ledger.length}) ▼`}
      </button>

      {expanded && (
        <div className={styles.ledgerList}>
          {ledger.length === 0 ? (
            <div className={styles.ledgerEmpty}>No payments recorded yet.</div>
          ) : (
            ledger.map((entry) => (
              <div key={entry.id} className={styles.ledgerRow}>
                <div className={styles.ledgerRowMain}>
                  <span className={styles.ledgerRowDate}>
                    {new Date(entry.entry_date).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {' · '}
                    {entry.entry_type === 'interest_only' ? 'Interest only' : 'EMI'}
                  </span>
                  <span className={styles.ledgerRowBreakdown}>
                    {fmtCurrency(entry.interest_component)} interest
                    {entry.principal_component > 0 && ` + ${fmtCurrency(entry.principal_component)} principal`}
                    {' · balance after '}
                    {fmtCurrency(entry.balance_after)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={styles.ledgerRowAmount}>{fmtCurrency(entry.amount)}</span>
                  <button
                    className={styles.ledgerUndoBtn}
                    onClick={() => handleUndo(entry.id)}
                    disabled={undoingId === entry.id}
                  >
                    {undoingId === entry.id ? 'Undoing…' : 'Undo'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function LoanCard({
  summary,
  onDelete,
  onEdit,
  onTogglePayment,
  togglingKey,
  onOpenLoanChanged,
}: {
  summary: LoanSummary;
  onDelete: (id: string) => void;
  onEdit: (loan: Loan) => void;
  onTogglePayment: (loanId: string, month: string, nextPaid: boolean) => void;
  togglingKey: string | null;
  onOpenLoanChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { loan } = summary;
  const togglingMonth =
    togglingKey && togglingKey.startsWith(loan.id + ':') ? togglingKey.slice(loan.id.length + 1) : null;

  const debtFreeDate = new Date(summary.debt_free_date);
  const debtFreeDateStr = debtFreeDate.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div className={summary.is_closed ? `${styles.loanCard} ${styles.loanCardClosed}` : styles.loanCard}>
      {/* Header */}
      <div
        className={`${styles.loanCardHeader} ${styles.loanCardHeaderClickable}`}
        onClick={() => setCollapsed((v) => !v)}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setCollapsed((v) => !v);
          }
        }}
      >
        <div className={styles.loanCardTitle}>
          <button
            type="button"
            className={`${styles.collapseChevron} ${collapsed ? styles.collapseChevronCollapsed : ''}`}
            onClick={(e) => { e.stopPropagation(); setCollapsed((v) => !v); }}
            title={collapsed ? 'Expand loan' : 'Collapse loan'}
            aria-label={collapsed ? 'Expand loan' : 'Collapse loan'}
          >
            <svg viewBox="0 0 20 20" fill="none" width={14} height={14}>
              <path
                d="M6 8l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <h3 className={styles.loanName}>{loan.name}</h3>
          {summary.is_closed && <span className={styles.closedBadge}>CLOSED</span>}
          {loan.loan_type === 'flexi' && <span className={styles.flexiBadge}>FLEXI</span>}
          {loan.loan_type === 'monthly' && <span className={styles.flexiBadge}>MONTHLY RATE</span>}
          {loan.loan_type === 'open' && <span className={styles.openBadge}>OPEN-ENDED</span>}
          <span className={styles.loanRate}>{loan.interest_rate.toFixed(2)}% p.a.</span>
          {collapsed && (
            <span className={styles.collapsedSummary}>
              {loan.loan_type === 'open'
                ? `${fmtCurrency(summary.outstanding_principal)} outstanding`
                : `${fmtCurrency(loan.emi_amount)}/mo · ${summary.percent_complete}% complete`}
            </span>
          )}
        </div>
        <div className={styles.loanCardActions} onClick={(e) => e.stopPropagation()}>
          <button className={styles.iconBtn} onClick={() => onEdit(loan)} title="Edit loan">
            <svg viewBox="0 0 20 20" fill="none" width={16} height={16}>
              <path
                d="M14.5 3.5l2 2L6 16l-2.5.5.5-2.5L14.5 3.5z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            className={styles.iconBtnDanger}
            onClick={() => onDelete(loan.id)}
            title="Delete loan"
          >
            <svg viewBox="0 0 20 20" fill="none" width={16} height={16}>
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className={`${styles.collapseWrap} ${collapsed ? styles.collapseWrapClosed : ''}`}>
        <div className={styles.collapseInner}>

      {/* Key metrics */}
      <div className={styles.loanMetrics}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Principal</span>
          <span className={styles.metricValue}>{fmtCurrency(loan.principal)}</span>
        </div>
        {loan.loan_type === 'open' ? (
          <>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Repaid So Far</span>
              <span className={styles.metricValue}>
                {fmtCurrency(loan.principal - summary.outstanding_principal)}
              </span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>This Month&apos;s Interest</span>
              <span className={styles.metricValue}>{fmtCurrency(summary.current_interest_due ?? 0)}</span>
            </div>
          </>
        ) : loan.loan_type === 'flexi' ? (
          <>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Interest-only / month</span>
              <span className={styles.metricValue}>{fmtCurrency(loan.interest_only_payment)}</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>EMI thereafter</span>
              <span className={styles.metricValue}>{fmtCurrency(loan.emi_amount)}</span>
            </div>
          </>
        ) : (
          <div className={styles.metric}>
            <span className={styles.metricLabel}>EMI / month</span>
            <span className={styles.metricValue}>{fmtCurrency(loan.emi_amount)}</span>
          </div>
        )}
        {loan.loan_type !== 'open' && (
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Tenure</span>
            <span className={styles.metricValue}>
              {loan.tenure_value} {loan.tenure_unit}
              {loan.loan_type === 'flexi' && loan.interest_only_months > 0 && (
                <span className={styles.metricSub}>
                  {' '}
                  ({loan.interest_only_value} {loan.interest_only_unit} interest-only)
                </span>
              )}
            </span>
          </div>
        )}
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Started</span>
          <span className={styles.metricValue}>
            {new Date(loan.emi_start_date).toLocaleString('en-IN', {
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Total Interest {loan.loan_type === 'open' ? 'Paid' : ''}</span>
          <span className={`${styles.metricValue} ${styles.metricValueInterest}`}>
            {fmtCurrency(summary.total_interest)}
          </span>
        </div>
      </div>

      {loan.loan_type === 'open' && (
        <OpenLoanSection
          loan={loan}
          summary={summary}
          expanded={expanded}
          onToggleExpanded={() => setExpanded((v) => !v)}
          onRecorded={() => onOpenLoanChanged()}
        />
      )}

      {loan.loan_type !== 'open' && summary.in_interest_only_phase && (
        <div className={styles.ioPhaseBanner}>
          Currently in interest-only phase — {summary.interest_only_months_remaining}{' '}
          {summary.interest_only_months_remaining === 1 ? 'month' : 'months'} left before EMI of{' '}
          {fmtCurrency(loan.emi_amount)} kicks in.
        </div>
      )}

      {loan.loan_type !== 'open' && (
        <>
          {/* EMI progress */}
          <div className={styles.progressSection}>
            <div className={styles.progressHeader}>
              <span className={styles.progressLabel}>EMI Progress</span>
              <span className={styles.progressStat}>
                {summary.paid_count} of {summary.total_emis} paid
                {' · '}
                <span className={styles.pendingBadge}>{summary.pending_count} pending</span>
              </span>
            </div>
            <ProgressBar pct={summary.percent_complete} color="var(--ledger-green)" />
            <div className={styles.progressAmounts}>
              <span className={styles.paidAmount}>{fmtCurrency(summary.total_amount_paid)} paid</span>
              <span className={styles.pendingAmount}>
                {fmtCurrency(summary.total_amount_pending)} remaining
              </span>
            </div>
            {summary.total_amount_pending > 0 && (
              <div className={styles.outstandingBreakdown}>
                {fmtCurrency(summary.outstanding_principal)} principal
                {' + '}
                {fmtCurrency(summary.outstanding_interest)} interest
              </div>
            )}
          </div>

          {/* Debt-free progress bar */}
          <div className={styles.debtFreeSection}>
            <div className={styles.progressHeader}>
              <span className={styles.progressLabel}>Debt-free countdown</span>
              <span className={styles.debtFreeDate}>{debtFreeDateStr}</span>
            </div>
            <ProgressBar pct={summary.percent_complete} color="var(--brass)" />
            <div className={styles.debtFreeFooter}>
              <span className={styles.paidAmount}>{summary.percent_complete}% complete</span>
              <span className={styles.pendingAmount}>
                Free in{' '}
                <strong>{debtFreeLabel(summary.months_remaining)}</strong>
              </span>
            </div>
          </div>

          {/* Expand toggle */}
          <button
            className={styles.toggleSchedule}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? 'Hide month-wise schedule ▲' : 'Show month-wise schedule ▼'}
          </button>

          {expanded && (
            <MonthlyScheduleTable
              schedule={summary.emi_schedule}
              togglingMonth={togglingMonth}
              onToggle={(month, nextPaid) => onTogglePayment(loan.id, month, nextPaid)}
            />
          )}
        </>
      )}
        </div>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

interface Props {
  displayName: string;
}

export default function LoanTracker({ displayName }: Props) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [monthIndex, setMonthIndex] = useState(-1);

  const fetchLoans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/loans');
      if (!res.ok) throw new Error('Failed to load loans');
      const data = await res.json();
      setLoans(data.loans ?? []);
    } catch {
      setError('Failed to load loans. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this loan? This cannot be undone.')) return;
    const res = await fetch(`/api/loans/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setLoans((prev) => prev.filter((l) => l.id !== id));
    } else {
      alert('Failed to delete loan.');
    }
  };

  const handleTogglePayment = async (loanId: string, month: string, nextPaid: boolean) => {
    const key = `${loanId}:${month}`;
    setTogglingKey(key);

    // Optimistic update
    setLoans((prev) =>
      prev.map((l) => {
        if (l.id !== loanId) return l;
        const payments = l.payments ?? [];
        const nextPayments = nextPaid
          ? [...payments.filter((p) => p.month !== month), { month, paid_at: new Date().toISOString() }]
          : payments.filter((p) => p.month !== month);
        return { ...l, payments: nextPayments };
      })
    );

    try {
      const res = nextPaid
        ? await fetch(`/api/loans/${loanId}/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month }),
          })
        : await fetch(`/api/loans/${loanId}/payments?month=${encodeURIComponent(month)}`, {
            method: 'DELETE',
          });

      if (!res.ok) throw new Error('Request failed');
    } catch {
      // Roll back on failure
      setLoans((prev) =>
        prev.map((l) => {
          if (l.id !== loanId) return l;
          const payments = l.payments ?? [];
          const rolledBack = nextPaid
            ? payments.filter((p) => p.month !== month)
            : [...payments.filter((p) => p.month !== month), { month, paid_at: new Date().toISOString() }];
          return { ...l, payments: rolledBack };
        })
      );
      alert('Failed to update payment status. Please try again.');
    } finally {
      setTogglingKey(null);
    }
  };

  const portfolio = buildPortfolioSummary(loans);
  // monthIndex -1 = current month (actual today's outstanding)
  // monthIndex >= 0 = projected outstanding after that future month's EMI
  const selectedMonth = monthIndex >= 0 && portfolio.upcoming_months.length > 0
    ? portfolio.upcoming_months[monthIndex]
    : null;
  const displayedOutstanding = selectedMonth ? selectedMonth.outstanding_after : portfolio.total_outstanding;
  const displayedOutstandingPrincipal = selectedMonth
    ? selectedMonth.outstanding_after_principal
    : portfolio.total_outstanding_principal;
  const displayedOutstandingInterest = selectedMonth
    ? selectedMonth.outstanding_after_interest
    : portfolio.total_outstanding_interest;

  useEffect(() => {
    setMonthIndex((i) => Math.min(i, Math.max(-1, portfolio.upcoming_months.length - 1)));
  }, [portfolio.upcoming_months.length]);

  return (
    <AppShell active="loans" displayName={displayName}>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <span className={styles.eyebrow}>Finance</span>
          <h2 className={styles.pageTitle}>Loan Management</h2>
        </div>

        <main className={styles.main}>
          {error && <div className={styles.errorBanner}>{error}</div>}

          {/* Portfolio summary */}
          {loans.length > 0 && (
            <>
              <div className={styles.summaryCard}>
                <div className={styles.summaryHeading}>Portfolio Overview</div>
                <div className={styles.summaryRow}>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Total Monthly EMI</span>
                    <span className={styles.summaryBig}>{fmtCurrency(portfolio.total_monthly_emi)}</span>
                  </div>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Total Outstanding</span>
                    <span className={`${styles.summaryBig} ${styles.summaryNeg}`}>
                      {fmtCurrency(displayedOutstanding)}
                    </span>
                    <span className={styles.summaryBreakdown}>
                      {fmtCurrency(displayedOutstandingPrincipal)} principal
                      {' + '}
                      {fmtCurrency(displayedOutstandingInterest)} interest
                    </span>
                    {selectedMonth && (
                      <span className={styles.summaryBreakdown}>after {selectedMonth.label} EMI</span>
                    )}
                    {!selectedMonth && (
                      <span className={styles.summaryBreakdown}>as of today · {portfolio.current_month.label}</span>
                    )}
                  </div>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Total Interest</span>
                    <span className={`${styles.summaryBig} ${styles.summaryNeg}`}>
                      {fmtCurrency(portfolio.total_interest)}
                    </span>
                  </div>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Active Loans</span>
                    <span className={styles.summaryBig}>{portfolio.loans.length}</span>
                  </div>
                </div>
              </div>

              <div className={styles.summaryCard}>
                <div className={styles.summaryHeading}>Debt-Free Countdown</div>
                <div className={styles.progressHeader}>
                  <span className={styles.progressLabel}>{portfolio.percent_complete}% complete</span>
                  <span className={styles.debtFreeDate}>
                    {new Date(portfolio.debt_free_date).toLocaleString('en-IN', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <ProgressBar pct={portfolio.percent_complete} color="var(--brass)" />
                <div className={styles.progressAmounts}>
                  <span className={styles.paidAmount}>{fmtCurrency(portfolio.total_amount_paid)} paid</span>
                  <span className={styles.pendingAmount}>
                    {fmtCurrency(portfolio.total_outstanding)} remaining
                  </span>
                </div>
                <div className={styles.debtFreeFooter}>
                  <span className={styles.paidAmount}>{portfolio.percent_complete}% paid off</span>
                  <span className={styles.pendingAmount}>
                    Free in <strong>{timeUntil(portfolio.debt_free_date).label}</strong>
                  </span>
                </div>
              </div>

              {portfolio.upcoming_months.length > 0 && (
                <div className={styles.nextMonthCard}>
                  <button
                    type="button"
                    className={styles.nextMonthArrow}
                    onClick={() => setMonthIndex((i) => Math.max(-1, i - 1))}
                    disabled={monthIndex === -1}
                    aria-label="Previous month"
                  >
                    ‹
                  </button>
                  <div className={styles.nextMonthContent}>
                    <span className={styles.nextMonthLabel}>
                      {monthIndex === -1
                        ? `${portfolio.current_month.label} EMI`
                        : `${portfolio.upcoming_months[monthIndex].label} EMI`}
                    </span>
                    <span className={styles.nextMonthAmount}>
                      {monthIndex === -1
                        ? fmtCurrency(portfolio.current_month.amount)
                        : fmtCurrency(portfolio.upcoming_months[monthIndex].amount)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.nextMonthArrow}
                    onClick={() =>
                      setMonthIndex((i) => Math.min(portfolio.upcoming_months.length - 1, i + 1))
                    }
                    disabled={monthIndex === portfolio.upcoming_months.length - 1}
                    aria-label="Next month"
                  >
                    ›
                  </button>
                </div>
              )}
            </>
          )}

          {/* Add button */}
          <div className={styles.toolbar}>
            <button
              className={styles.addBtn}
              onClick={() => { setEditingLoan(null); setShowModal(true); }}
            >
              + Add Loan
            </button>
          </div>

          {/* Loan cards */}
          {loading ? (
            <p className={styles.loadingText}>Loading loans…</p>
          ) : loans.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>No loans added yet</p>
              <p className={styles.emptyHint}>
                Add your first loan to track EMIs, interest, and your path to debt freedom.
              </p>
            </div>
          ) : (
            <>
              {portfolio.loans.length > 0 && (
                <div className={styles.loanList}>
                  {portfolio.loans.map((summary) => (
                    <LoanCard
                      key={summary.loan.id}
                      summary={summary}
                      onDelete={handleDelete}
                      onEdit={(loan) => { setEditingLoan(loan); setShowModal(true); }}
                      onTogglePayment={handleTogglePayment}
                      togglingKey={togglingKey}
                      onOpenLoanChanged={fetchLoans}
                    />
                  ))}
                </div>
              )}

              {portfolio.closed_loans.length > 0 && (
                <div className={styles.closedSection}>
                  <div className={styles.closedSectionHeader}>
                    <span className={styles.closedSectionTitle}>Closed Loans</span>
                    <span className={styles.closedSectionCount}>
                      {portfolio.closed_loans.length} paid off
                    </span>
                  </div>
                  <div className={styles.loanList}>
                    {portfolio.closed_loans.map((summary) => (
                      <LoanCard
                        key={summary.loan.id}
                        summary={summary}
                        onDelete={handleDelete}
                        onEdit={(loan) => { setEditingLoan(loan); setShowModal(true); }}
                        onTogglePayment={handleTogglePayment}
                        togglingKey={togglingKey}
                        onOpenLoanChanged={fetchLoans}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        {showModal && (
          <AddLoanModal
            existing={editingLoan}
            onClose={() => { setShowModal(false); setEditingLoan(null); }}
            onSaved={(loan) => {
              if (editingLoan) {
                setLoans((prev) => prev.map((l) => (l.id === loan.id ? loan : l)));
              } else {
                setLoans((prev) => [loan, ...prev]);
              }
              setShowModal(false);
              setEditingLoan(null);
            }}
          />
        )}
      </div>
    </AppShell>
  );
}
