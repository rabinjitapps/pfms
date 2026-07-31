'use client';

import { useState, useEffect, useMemo } from 'react';
import { Goal, GoalContribution, GoalSummary } from '@/types';
import styles from './GoalModals.module.css';

function fmtCurrency(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface Props {
  goals: Goal[];
  summariesById: Record<string, GoalSummary>;
  defaultGoalId: string | null;
  existing: GoalContribution | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function GoalContributionModal({
  goals,
  summariesById,
  defaultGoalId,
  existing,
  onClose,
  onSaved,
}: Props) {
  const [goalId, setGoalId] = useState(existing?.goal_id ?? defaultGoalId ?? goals[0]?.id ?? '');
  const [date, setDate] = useState(existing?.date ?? new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [note, setNote] = useState(existing?.note ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setGoalId(existing.goal_id);
      setDate(existing.date);
      setAmount(String(existing.amount));
      setNote(existing.note ?? '');
    }
  }, [existing]);

  const selectedSummary = summariesById[goalId];

  const preview = useMemo(() => {
    if (!selectedSummary) return null;
    const amountNum = Number(amount) || 0;
    // If editing, the existing amount is already counted in total_contributed —
    // swap it out for the new amount so the preview reflects the edit, not a double-count.
    const alreadyCounted = existing && existing.goal_id === goalId ? existing.amount : 0;
    const projectedTotal = selectedSummary.total_contributed - alreadyCounted + amountNum;
    const target = selectedSummary.goal.target_amount;
    const pct = target > 0 ? Math.min(100, Math.round((projectedTotal / target) * 100)) : 0;
    return { projectedTotal, pct, target };
  }, [selectedSummary, amount, existing, goalId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!goalId) {
      setError('Please select a goal.');
      return;
    }
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      setError('Amount must be a positive number.');
      return;
    }

    setSaving(true);
    try {
      const url = existing ? `/api/goal-contributions/${existing.id}` : '/api/goal-contributions';
      const method = existing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal_id: goalId,
          date,
          amount: amountNum,
          note: note.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save contribution.');
        return;
      }

      onSaved();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{existing ? 'Edit Contribution' : 'Add Contribution'}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 20 20" fill="none" width={18} height={18}>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Goal</label>
            <select
              className={styles.select}
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              disabled={!!existing}
              required
            >
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.icon ? `${g.icon} ` : ''}
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Date</label>
              <input
                className={styles.input}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Amount (₹)</label>
              <input
                className={styles.input}
                type="number"
                min="0.01"
                step="0.01"
                placeholder="e.g. 5000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Note (optional)</label>
            <input
              className={styles.input}
              type="text"
              placeholder="e.g. Monthly SIP-style top-up"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {preview && (
            <div className={styles.previewCard}>
              <div className={styles.previewRow}>
                <span className={styles.previewLabel}>Progress After Saving</span>
                <span className={styles.previewValue}>{preview.pct}%</span>
              </div>
              <div className={styles.previewRow}>
                <span className={styles.previewLabel}>Total / Target</span>
                <span className={styles.previewValue}>
                  {fmtCurrency(preview.projectedTotal)} / {fmtCurrency(preview.target)}
                </span>
              </div>
            </div>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving…' : existing ? 'Update Contribution' : 'Add Contribution'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
