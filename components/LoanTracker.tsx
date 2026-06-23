'use client';

import { useState, useEffect, useCallback } from 'react';
import AppShell from './AppShell';
import AddLoanModal from './AddLoanModal';
import styles from './LoanTracker.module.css';
import { Loan, LoanSummary, LoanPortfolioSummary } from '@/types';

// ── helpers ──────────────────────────────────────────────────────────────────

function buildLoanSummary(loan: Loan): LoanSummary {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = new Date(loan.emi_start_date);
  const schedule = [];

  for (let i = 0; i < loan.total_months; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const is_future = d > today;
    const is_paid =
      d < today && d.getFullYear() * 12 + d.getMonth() < today.getFullYear() * 12 + today.getMonth();

    schedule.push({
      month: monthStr,
      emi_amount: loan.emi_amount,
      is_paid,
      is_future,
    });
  }

  const paid_count = schedule.filter((s) => s.is_paid).length;
  const pending_count = loan.total_months - paid_count;
  const total_amount_paid = paid_count * loan.emi_amount;
  const total_amount_pending = pending_count * loan.emi_amount;
  const percent_complete = Math.round((paid_count / loan.total_months) * 100);

  // Debt-free = start date + total_months
  const debtFreeDate = new Date(
    startDate.getFullYear(),
    startDate.getMonth() + loan.total_months,
    1
  );

  const diffMs = debtFreeDate.getTime() - today.getTime();
  const totalDaysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const months_remaining = Math.ceil(totalDaysRemaining / 30.44);
  const years_remaining = months_remaining / 12;

  return {
    loan,
    paid_count,
    pending_count,
    total_emis: loan.total_months,
    total_amount_paid,
    total_amount_pending,
    percent_complete,
    debt_free_date: debtFreeDate.toISOString(),
    months_remaining,
    years_remaining,
    emi_schedule: schedule,
  };
}

function buildPortfolioSummary(loans: Loan[]): LoanPortfolioSummary {
  const summaries = loans.map(buildLoanSummary);
  const totalMonthlyEmi = loans.reduce((s, l) => {
    // Only count active loans (not yet fully paid)
    const summary = buildLoanSummary(l);
    return summary.pending_count > 0 ? s + l.emi_amount : s;
  }, 0);
  const totalOutstanding = summaries.reduce((s, ls) => s + ls.total_amount_pending, 0);
  return { loans: summaries, total_monthly_emi: totalMonthlyEmi, total_outstanding: totalOutstanding };
}

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

function MonthlyScheduleTable({ schedule, emi }: { schedule: LoanSummary['emi_schedule']; emi: number }) {
  // Group by year
  const years: Record<string, { month: string; is_paid: boolean; is_future: boolean }[]> = {};
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
                return (
                  <div
                    key={m.month}
                    className={
                      m.is_paid
                        ? styles.scheduleCell + ' ' + styles.schedulePaid
                        : m.is_future
                        ? styles.scheduleCell + ' ' + styles.scheduleFuture
                        : styles.scheduleCell + ' ' + styles.scheduleCurrent
                    }
                  >
                    <span className={styles.scheduleCellMonth}>{monthName}</span>
                    <span className={styles.scheduleCellAmount}>{fmtCurrency(emi)}</span>
                    <span className={styles.scheduleCellStatus}>
                      {m.is_paid ? '✓ paid' : m.is_future ? 'upcoming' : 'current'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LoanCard({
  summary,
  onDelete,
  onEdit,
}: {
  summary: LoanSummary;
  onDelete: (id: string) => void;
  onEdit: (loan: Loan) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { loan } = summary;

  const debtFreeDate = new Date(summary.debt_free_date);
  const debtFreeDateStr = debtFreeDate.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div className={styles.loanCard}>
      {/* Header */}
      <div className={styles.loanCardHeader}>
        <div className={styles.loanCardTitle}>
          <h3 className={styles.loanName}>{loan.name}</h3>
          <span className={styles.loanRate}>{loan.interest_rate.toFixed(2)}% p.a.</span>
        </div>
        <div className={styles.loanCardActions}>
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

      {/* Key metrics */}
      <div className={styles.loanMetrics}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Principal</span>
          <span className={styles.metricValue}>{fmtCurrency(loan.principal)}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>EMI / month</span>
          <span className={styles.metricValue}>{fmtCurrency(loan.emi_amount)}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Tenure</span>
          <span className={styles.metricValue}>
            {loan.tenure_value} {loan.tenure_unit}
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Started</span>
          <span className={styles.metricValue}>
            {new Date(loan.emi_start_date).toLocaleString('en-IN', {
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>
      </div>

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
        <MonthlyScheduleTable schedule={summary.emi_schedule} emi={loan.emi_amount} />
      )}
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

  const portfolio = buildPortfolioSummary(loans);

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
                    {fmtCurrency(portfolio.total_outstanding)}
                  </span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Active Loans</span>
                  <span className={styles.summaryBig}>{loans.length}</span>
                </div>
              </div>
            </div>
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
            <div className={styles.loanList}>
              {portfolio.loans.map((summary) => (
                <LoanCard
                  key={summary.loan.id}
                  summary={summary}
                  onDelete={handleDelete}
                  onEdit={(loan) => { setEditingLoan(loan); setShowModal(true); }}
                />
              ))}
            </div>
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
