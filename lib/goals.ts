/**
 * Shared goal/milestone math — used by the API route (server) so the
 * progress percentage, remaining amount, and month/year-grouped
 * contribution history a person sees always come from one place.
 */

import {
  Goal,
  GoalContribution,
  GoalSummary,
  GoalPortfolioSummary,
  GoalYearlyContribution,
  GoalMonthlyContribution,
} from '@/types';

const round2 = (n: number) => Math.round(n * 100) / 100;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// month is "YYYY-MM" — used by the UI to render "March 2026" section headers.
export function monthLabel(month: string): string {
  const idx = Number(month.slice(5, 7)) - 1;
  return `${MONTH_NAMES[idx] ?? month} ${month.slice(0, 4)}`;
}

/**
 * Calendar-accurate whole months remaining until a target ISO date, floored
 * at 0. Mirrors the "debt-free countdown" logic on the Loans page, but
 * counting up to a savings goal instead of down to an EMI payoff.
 */
function monthsUntil(targetIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetIso + 'T00:00:00');
  if (target <= today) return 0;

  let months = (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth());
  if (target.getDate() < today.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * Build one goal's summary: total contributed, progress %, and its
 * contribution history grouped into year -> month buckets (both ordered
 * most-recent-first) for the accordion under each goal card.
 */
export function buildGoalSummary(goal: Goal, contributions: GoalContribution[]): GoalSummary {
  const sorted = [...contributions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1; // most recent first
    return a.created_at < b.created_at ? 1 : -1;
  });

  const total_contributed = round2(sorted.reduce((sum, c) => sum + c.amount, 0));
  const percent_complete =
    goal.target_amount > 0 ? Math.min(100, round2((total_contributed / goal.target_amount) * 100)) : 0;
  const remaining_amount = Math.max(0, round2(goal.target_amount - total_contributed));

  const yearMap = new Map<string, Map<string, GoalContribution[]>>();
  for (const c of sorted) {
    const year = c.date.slice(0, 4);
    const month = c.date.slice(0, 7);
    if (!yearMap.has(year)) yearMap.set(year, new Map());
    const monthMap = yearMap.get(year)!;
    if (!monthMap.has(month)) monthMap.set(month, []);
    monthMap.get(month)!.push(c);
  }

  const by_year: GoalYearlyContribution[] = [...yearMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([year, monthMap]) => {
      const months: GoalMonthlyContribution[] = [...monthMap.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([month, list]) => ({
          month,
          total: round2(list.reduce((sum, c) => sum + c.amount, 0)),
          contributions: list,
        }));
      return { year, total: round2(months.reduce((sum, m) => sum + m.total, 0)), months };
    });

  return {
    goal,
    total_contributed,
    percent_complete,
    remaining_amount,
    contributions: sorted,
    by_year,
    months_remaining: goal.target_date ? monthsUntil(goal.target_date) : null,
  };
}

export function buildGoalPortfolioSummary(
  goals: Goal[],
  contributionsByGoal: Record<string, GoalContribution[]>
): GoalPortfolioSummary {
  const summaries = goals.map((g) => buildGoalSummary(g, contributionsByGoal[g.id] ?? []));

  return {
    goals: summaries,
    total_target: round2(summaries.reduce((sum, s) => sum + s.goal.target_amount, 0)),
    total_contributed: round2(summaries.reduce((sum, s) => sum + s.total_contributed, 0)),
    active_count: summaries.filter((s) => s.goal.status === 'active').length,
    completed_count: summaries.filter((s) => s.goal.status === 'completed' || s.percent_complete >= 100).length,
  };
}
