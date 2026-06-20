'use client';

import { useMemo } from 'react';
import styles from './MonthSwitcher.module.css';

interface Props {
  year: number;
  availableYears: number[]; // sorted ascending — years with at least one transaction
  onChange: (year: number) => void;
}

export default function YearSwitcher({ year, availableYears, onChange }: Props) {
  const minYear = availableYears[0] ?? year;
  const maxYear = availableYears[availableYears.length - 1] ?? year;

  const canGoPrev = year > minYear;
  const canGoNext = year < maxYear;

  const options = useMemo(() => {
    const set = new Set(availableYears);
    set.add(year);
    return Array.from(set).sort((a, b) => b - a);
  }, [availableYears, year]);

  return (
    <div className={styles.switcher}>
      <button
        className={styles.arrowBtn}
        onClick={() => onChange(year - 1)}
        disabled={!canGoPrev}
        aria-label="Previous year"
      >
        ‹
      </button>

      <select
        className={styles.monthSelect}
        value={year}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Select year"
      >
        {options.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      <button
        className={styles.arrowBtn}
        onClick={() => onChange(year + 1)}
        disabled={!canGoNext}
        aria-label="Next year"
      >
        ›
      </button>
    </div>
  );
}
