'use client';

import { useState, useEffect, useCallback } from 'react';
import AppShell from './AppShell';
import AddGoalModal from './AddGoalModal';
import GoalContributionModal from './GoalContributionModal';
import styles from './GoalTracker.module.css';
import { monthLabel } from '@/lib/goals';
import {
  Goal,
  GoalContribution,
  GoalPortfolioSummary,
  GoalSummary,
  GoalYearlyContribution,
} from '@/types';

interface Props {
  displayName: string;
}

function fmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtCurrency(n: number): string {
  return '₹' + fmt(n);
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function targetDateLabel(targetDate: string, monthsRemaining: number | null, percentComplete: number): string {
  if (percentComplete >= 100) return 'Target reached';
  if (monthsRemaining === null) return '';
  if (monthsRemaining <= 0) return `Due ${fmtDate(targetDate)} — overdue`;
  if (monthsRemaining < 12) return `${monthsRemaining} mo left · ${fmtDate(targetDate)}`;
  const y = Math.floor(monthsRemaining / 12);
  const m = monthsRemaining % 12;
  const parts = [`${y}y`];
  if (m > 0) parts.push(`${m}m`);
  return `${parts.join(' ')} left · ${fmtDate(targetDate)}`;
}

function progressColor(pct: number): string {
  if (pct >= 100) return 'var(--ledger-green)';
  if (pct >= 60) return 'var(--brass)';
  return 'var(--brick)';
}

// ── sub-components ─────────────────────────────────────────────────────────

function GoalRing({ pct, color }: { pct: number; color: string }) {
  const size = 58;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, pct)) / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={styles.ring}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--hairline)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={styles.ringArc}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className={styles.ringText}>
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className={styles.progressTrack}>
      <div className={styles.progressFill} style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  );
}

function ContributionHistory({
  byYear,
  onEdit,
  onDelete,
}: {
  byYear: GoalYearlyContribution[];
  onEdit: (c: GoalContribution) => void;
  onDelete: (id: string) => void;
}) {
  const [openYears, setOpenYears] = useState<Set<string>>(new Set([byYear[0]?.year]));
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());

  const toggleYear = (year: string) => {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  const toggleMonth = (key: string) => {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (byYear.length === 0) {
    return <p className={styles.emptyHistory}>No contributions logged yet.</p>;
  }

  return (
    <div className={styles.history}>
      {byYear.map((y) => (
        <div key={y.year} className={styles.yearBlock}>
          <button className={styles.yearRow} onClick={() => toggleYear(y.year)}>
            <span className={styles.yearChevron} data-open={openYears.has(y.year)}>
              ▸
            </span>
            <span className={styles.yearLabel}>{y.year}</span>
            <span className={styles.yearTotal}>{fmtCurrency(y.total)}</span>
          </button>

          {openYears.has(y.year) && (
            <div className={styles.monthList}>
              {y.months.map((m) => {
                const key = `${y.year}-${m.month}`;
                return (
                  <div key={m.month} className={styles.monthBlock}>
                    <button className={styles.monthRow} onClick={() => toggleMonth(key)}>
                      <span className={styles.monthChevron} data-open={openMonths.has(key)}>
                        ▸
                      </span>
                      <span className={styles.monthLabel}>{monthLabel(m.month)}</span>
                      <span className={styles.monthTotal}>{fmtCurrency(m.total)}</span>
                    </button>

                    {openMonths.has(key) && (
                      <div className={styles.contribList}>
                        {m.contributions.map((c) => (
                          <div key={c.id} className={styles.contribRow}>
                            <div className={styles.contribMain}>
                              <span className={styles.contribDate}>{fmtDate(c.date)}</span>
                              {c.note && <span className={styles.contribNote}>{c.note}</span>}
                            </div>
                            <div className={styles.contribRight}>
                              <span className={styles.contribAmount}>+{fmtCurrency(c.amount)}</span>
                              <div className={styles.contribActions}>
                                <button
                                  className={styles.iconBtnSmall}
                                  onClick={() => onEdit(c)}
                                  title="Edit contribution"
                                >
                                  <svg viewBox="0 0 20 20" fill="none" width={12} height={12}>
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
                                  className={styles.iconBtnSmallDanger}
                                  onClick={() => onDelete(c.id)}
                                  title="Delete contribution"
                                >
                                  <svg viewBox="0 0 20 20" fill="none" width={12} height={12}>
                                    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function GoalCard({
  summary,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddContribution,
  onEditContribution,
  onDeleteContribution,
}: {
  summary: GoalSummary;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: (goal: Goal) => void;
  onDelete: (id: string) => void;
  onAddContribution: (goalId: string) => void;
  onEditContribution: (c: GoalContribution) => void;
  onDeleteContribution: (id: string) => void;
}) {
  const { goal, total_contributed, percent_complete, remaining_amount, by_year, months_remaining } = summary;
  const color = progressColor(percent_complete);
  const achieved = percent_complete >= 100;

  return (
    <div className={styles.goalCard}>
      <div className={styles.goalCardHeader}>
        <div className={styles.goalCardTitleGroup}>
          <span className={styles.goalIcon}>{goal.icon || '🎯'}</span>
          <div className={styles.goalTitleText}>
            <h3 className={styles.goalName}>{goal.name}</h3>
            <div className={styles.badgeRow}>
              {goal.category && <span className={styles.categoryBadge}>{goal.category}</span>}
              {achieved && <span className={styles.achievedBadge}>Achieved</span>}
            </div>
          </div>
        </div>
        <div className={styles.goalCardRight}>
          <div className={styles.goalCardActions}>
            <button className={styles.iconBtn} onClick={() => onEdit(goal)} title="Edit goal">
              <svg viewBox="0 0 20 20" fill="none" width={13} height={13}>
                <path
                  d="M14.5 3.5l2 2L6 16l-2.5.5.5-2.5L14.5 3.5z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button className={styles.iconBtnDanger} onClick={() => onDelete(goal.id)} title="Delete goal">
              <svg viewBox="0 0 20 20" fill="none" width={13} height={13}>
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <GoalRing pct={percent_complete} color={color} />
        </div>
      </div>

      {goal.description && <p className={styles.goalDescription}>{goal.description}</p>}

      <ProgressBar pct={percent_complete} color={color} />

      <div className={styles.amountsRow}>
        <div className={styles.amountBlock}>
          <span className={styles.metricLabel}>Saved</span>
          <span className={styles.amountValuePos}>{fmtCurrency(total_contributed)}</span>
        </div>
        <div className={styles.amountBlock}>
          <span className={styles.metricLabel}>Target</span>
          <span className={styles.amountValue}>{fmtCurrency(goal.target_amount)}</span>
        </div>
        <div className={styles.amountBlock}>
          <span className={styles.metricLabel}>Remaining</span>
          <span className={styles.amountValue}>{fmtCurrency(remaining_amount)}</span>
        </div>
      </div>

      {goal.target_date && (
        <div className={achieved ? styles.dateBadgeDone : styles.dateBadge}>
          {targetDateLabel(goal.target_date, months_remaining, percent_complete)}
        </div>
      )}

      <div className={styles.goalCardFooter}>
        <button className={styles.addTxnBtn} onClick={() => onAddContribution(goal.id)}>
          + Add Contribution
        </button>
        <button className={styles.toggleHistory} onClick={onToggleExpand}>
          {expanded ? 'Hide' : 'Show'} contributions ({summary.contributions.length})
        </button>
      </div>

      {expanded && (
        <ContributionHistory byYear={by_year} onEdit={onEditContribution} onDelete={onDeleteContribution} />
      )}
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────

export default function GoalTracker({ displayName }: Props) {
  const [portfolio, setPortfolio] = useState<GoalPortfolioSummary>({
    goals: [],
    total_target: 0,
    total_contributed: 0,
    active_count: 0,
    completed_count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  const [showContribModal, setShowContribModal] = useState(false);
  const [contribDefaultGoalId, setContribDefaultGoalId] = useState<string | null>(null);
  const [editingContrib, setEditingContrib] = useState<GoalContribution | null>(null);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchPortfolio = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/goals');
      if (!res.ok) throw new Error('Failed to load goals');
      const data = await res.json();
      setPortfolio(
        data.portfolio ?? { goals: [], total_target: 0, total_contributed: 0, active_count: 0, completed_count: 0 }
      );
    } catch {
      setError('Failed to load goals. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteGoal = async (id: string) => {
    if (!confirm('Delete this goal and its entire contribution history? This cannot be undone.')) return;
    const res = await fetch(`/api/goals/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchPortfolio();
    } else {
      alert('Failed to delete goal.');
    }
  };

  const handleDeleteContribution = async (id: string) => {
    if (!confirm('Delete this contribution? This cannot be undone.')) return;
    const res = await fetch(`/api/goal-contributions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchPortfolio();
    } else {
      alert('Failed to delete contribution.');
    }
  };

  const summariesById: Record<string, GoalSummary> = {};
  for (const s of portfolio.goals) summariesById[s.goal.id] = s;

  const overallPct = portfolio.total_target > 0 ? Math.min(100, Math.round((portfolio.total_contributed / portfolio.total_target) * 100)) : 0;

  return (
    <AppShell active="goals" displayName={displayName}>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <span className={styles.eyebrow}>Finance</span>
          <h2 className={styles.pageTitle}>Goals &amp; Milestones</h2>
        </div>

        <main className={styles.main}>
          {error && <div className={styles.errorBanner}>{error}</div>}

          {loading ? (
            <p className={styles.loadingText}>Loading…</p>
          ) : (
            <>
              {portfolio.goals.length > 0 && (
                <div className={styles.summaryCard}>
                  <div className={styles.summaryHeading}>Portfolio Overview</div>
                  <div className={styles.summaryRow}>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Total Saved</span>
                      <span className={styles.summaryBig}>{fmtCurrency(portfolio.total_contributed)}</span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Total Target</span>
                      <span className={styles.summaryBig}>{fmtCurrency(portfolio.total_target)}</span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Active</span>
                      <span className={styles.summaryBig}>{portfolio.active_count}</span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Achieved</span>
                      <span className={styles.summaryBig}>{portfolio.completed_count}</span>
                    </div>
                  </div>
                  <div className={styles.summaryProgressWrap}>
                    <ProgressBar pct={overallPct} color="var(--ledger-green)" />
                    <span className={styles.summaryProgressLabel}>{overallPct}% of total target saved</span>
                  </div>
                </div>
              )}

              <div className={styles.toolbar}>
                <button
                  className={styles.addBtnSecondary}
                  onClick={() => {
                    setEditingContrib(null);
                    setContribDefaultGoalId(portfolio.goals[0]?.goal.id ?? null);
                    setShowContribModal(true);
                  }}
                  disabled={portfolio.goals.length === 0}
                >
                  + Add Contribution
                </button>
                <button
                  className={styles.addBtn}
                  onClick={() => {
                    setEditingGoal(null);
                    setShowGoalModal(true);
                  }}
                >
                  + Add Goal
                </button>
              </div>

              {portfolio.goals.length === 0 ? (
                <div className={styles.emptyState}>
                  <h3 className={styles.emptyTitle}>No goals yet</h3>
                  <p className={styles.emptyHint}>
                    Add a goal — an emergency fund, a trip, a gadget — and start logging contributions toward it.
                  </p>
                </div>
              ) : (
                <div className={styles.goalGrid}>
                  {portfolio.goals.map((summary) => (
                    <GoalCard
                      key={summary.goal.id}
                      summary={summary}
                      expanded={expandedIds.has(summary.goal.id)}
                      onToggleExpand={() => toggleExpand(summary.goal.id)}
                      onEdit={(goal) => {
                        setEditingGoal(goal);
                        setShowGoalModal(true);
                      }}
                      onDelete={handleDeleteGoal}
                      onAddContribution={(goalId) => {
                        setEditingContrib(null);
                        setContribDefaultGoalId(goalId);
                        setShowContribModal(true);
                      }}
                      onEditContribution={(c) => {
                        setEditingContrib(c);
                        setShowContribModal(true);
                      }}
                      onDeleteContribution={handleDeleteContribution}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {showGoalModal && (
        <AddGoalModal
          existing={editingGoal}
          onClose={() => setShowGoalModal(false)}
          onSaved={() => {
            setShowGoalModal(false);
            fetchPortfolio();
          }}
        />
      )}

      {showContribModal && (
        <GoalContributionModal
          goals={portfolio.goals.map((s) => s.goal)}
          summariesById={summariesById}
          defaultGoalId={contribDefaultGoalId}
          existing={editingContrib}
          onClose={() => setShowContribModal(false)}
          onSaved={() => {
            setShowContribModal(false);
            fetchPortfolio();
          }}
        />
      )}
    </AppShell>
  );
}
