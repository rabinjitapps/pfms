'use client';

import { useRef, useEffect } from 'react';
import { FundGrowthPoint, FundGrowthPeriodType } from '@/types';
import styles from './PeriodCardSlider.module.css';

interface Props {
  points: FundGrowthPoint[];
  periodType: FundGrowthPeriodType;
  selectedPeriod: string | null; // null = no explicit selection, defaults to latest
  onSelect: (period: string) => void;
}

function formatCompactINR(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}k`;
  return `${sign}₹${abs.toFixed(0)}`;
}

function formatCardLabel(period: string, periodType: FundGrowthPeriodType): string {
  if (periodType === 'year') return period;
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

export default function PeriodCardSlider({ points, periodType, selectedPeriod, onSelect }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Keep the active card in view when the selection changes from outside
  // this component (e.g. switching the year resets the highlighted point).
  useEffect(() => {
    if (!selectedPeriod || !trackRef.current) return;
    const activeEl = trackRef.current.querySelector<HTMLElement>(`[data-period="${selectedPeriod}"]`);
    activeEl?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selectedPeriod]);

  function scrollByCard(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>('[data-card]');
    const step = (card?.offsetWidth ?? 110) + 10;
    track.scrollBy({ left: step * direction, behavior: 'smooth' });
  }

  if (points.length === 0) return null;

  const effectiveSelected = selectedPeriod ?? points[points.length - 1].period;

  return (
    <div className={styles.sliderWrap}>
      <button
        type="button"
        className={styles.arrowBtn}
        onClick={() => scrollByCard(-1)}
        aria-label={periodType === 'year' ? 'Scroll to earlier years' : 'Scroll to earlier months'}
      >
        ‹
      </button>

      <div className={styles.track} ref={trackRef}>
        {points.map((p) => {
          const gain = p.current - p.invested;
          const isActive = p.period === effectiveSelected;
          return (
            <button
              key={p.period}
              type="button"
              data-card
              data-period={p.period}
              className={isActive ? styles.cardActive : styles.card}
              onClick={() => onSelect(p.period)}
            >
              <span className={styles.cardLabel}>{formatCardLabel(p.period, periodType)}</span>
              <span className={styles.cardValue}>{formatCompactINR(p.current)}</span>
              <span className={gain >= 0 ? styles.cardGainPositive : styles.cardGainNegative}>
                {gain >= 0 ? '+' : ''}
                {formatCompactINR(gain)}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={styles.arrowBtn}
        onClick={() => scrollByCard(1)}
        aria-label={periodType === 'year' ? 'Scroll to later years' : 'Scroll to later months'}
      >
        ›
      </button>
    </div>
  );
}
