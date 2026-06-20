'use client';

import { useMemo } from 'react';
import styles from './MonthSwitcher.module.css';

interface Props {
  month: string; // YYYY-MM
  availableMonths: string[]; // YYYY-MM[], sorted ascending
  onChange: (month: string) => void;
}

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(year, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(year, m - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export default function MonthSwitcher({ month, availableMonths, onChange }: Props) {
  // The switcher should always be able to reach every month that has at
  // least one entry, plus the current month — but it shouldn't let you
  // wander indefinitely into empty future months, so "next" stops one
  // month past the latest month with data (or the current month).
  const minMonth = availableMonths[0] ?? month;
  const maxMonth = availableMonths[availableMonths.length - 1] ?? month;

  const canGoPrev = month > minMonth;
  const canGoNext = month < maxMonth;

  const options = useMemo(() => {
    const set = new Set(availableMonths);
    set.add(month);
    return Array.from(set).sort().reverse();
  }, [availableMonths, month]);

  return (
    <div className={styles.switcher}>
      <button
        className={styles.arrowBtn}
        onClick={() => onChange(shiftMonth(month, -1))}
        disabled={!canGoPrev}
        aria-label="Previous month"
      >
        ‹
      </button>

      <select
        className={styles.monthSelect}
        value={month}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Select month"
      >
        {options.map((m) => (
          <option key={m} value={m}>
            {formatMonthLabel(m)}
          </option>
        ))}
      </select>

      <button
        className={styles.arrowBtn}
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={!canGoNext}
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}
