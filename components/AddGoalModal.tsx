'use client';

import { useState, useEffect } from 'react';
import { Goal } from '@/types';
import styles from './GoalModals.module.css';

interface Props {
  existing: Goal | null;
  onClose: () => void;
  onSaved: (goal: Goal) => void;
}

const GOAL_CATEGORIES = [
  'Emergency Fund', 'Travel', 'Gadget', 'Vehicle', 'Home', 'Wedding', 'Education', 'Investment', 'Other',
];

const GOAL_ICONS = ['🎯', '✈️', '🏠', '🚗', '💍', '🎓', '💻', '🛡️', '🏥', '🎉'];

export default function AddGoalModal({ existing, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Emergency Fund');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [icon, setIcon] = useState('🎯');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setDescription(existing.description ?? '');
      setCategory(existing.category ?? 'Emergency Fund');
      setTargetAmount(String(existing.target_amount));
      setTargetDate(existing.target_date ?? '');
      setIcon(existing.icon ?? '🎯');
    }
  }, [existing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Goal name is required.');
      return;
    }
    const targetNum = Number(targetAmount);
    if (!targetNum || targetNum <= 0) {
      setError('Target amount must be a positive number.');
      return;
    }

    setSaving(true);
    try {
      const url = existing ? `/api/goals/${existing.id}` : '/api/goals';
      const method = existing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          category,
          target_amount: targetNum,
          target_date: targetDate || null,
          icon,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save goal.');
        return;
      }

      onSaved(data.goal);
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
          <h2 className={styles.modalTitle}>{existing ? 'Edit Goal' : 'Add Goal / Milestone'}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 20 20" fill="none" width={18} height={18}>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.rowTight}>
            <div className={styles.field}>
              <label className={styles.label}>Icon</label>
              <select className={`${styles.select} ${styles.iconInput}`} value={icon} onChange={(e) => setIcon(e.target.value)}>
                {GOAL_ICONS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Goal Name</label>
              <input
                className={styles.input}
                type="text"
                placeholder="e.g. Emergency Fund, Goa Trip, New Laptop"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Category</label>
            <div className={styles.chipRow}>
              {GOAL_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={category === c ? `${styles.chip} ${styles.chipActive}` : styles.chip}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Target Amount (₹)</label>
              <input
                className={styles.input}
                type="number"
                min="1"
                step="0.01"
                placeholder="e.g. 200000"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                required
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Target Date (optional)</label>
              <input
                className={styles.input}
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Notes (optional)</label>
            <textarea
              className={styles.textarea}
              placeholder="Any details about this goal…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving…' : existing ? 'Update Goal' : 'Add Goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
