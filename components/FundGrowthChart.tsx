'use client';

import { FundGrowthPoint, FundGrowthPeriodType } from '@/types';

interface Props {
  points: FundGrowthPoint[];
  periodType: FundGrowthPeriodType;
}

function formatCompactINR(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}k`;
  return `${sign}₹${abs.toFixed(0)}`;
}

function formatPeriodLabel(period: string, periodType: FundGrowthPeriodType): string {
  if (periodType === 'year') return period;
  const m = Number(period.split('-')[1]);
  const d = new Date(2000, m - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'short' });
}

// Picks a "nice" round number at or above `value` for the chart's top
// gridline, so the y-axis doesn't end on an awkward figure like ₹83,412.
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const step = magnitude / 2;
  return Math.ceil(value / step) * step;
}

// Double-line SVG chart plotting invested amount vs current value across
// a series of periods (months within a year, or one point per year).
// Deliberately framework-free (no chart library) to match the rest of the
// app's hand-rolled SVG visuals (see HeadBarChart).
export default function FundGrowthChart({ points, periodType }: Props) {
  if (points.length === 0) return null;

  const width = 720;
  const height = 280;
  const padLeft = 60;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 32;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxVal = Math.max(1, ...points.flatMap((p) => [p.invested, p.current]));
  const niceMax = niceCeiling(maxVal);

  const n = points.length;
  const xAt = (i: number) => (n <= 1 ? padLeft + chartW / 2 : padLeft + (i / (n - 1)) * chartW);
  const yAt = (v: number) => padTop + chartH - (niceMax > 0 ? (v / niceMax) * chartH : 0);

  const investedPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p.invested).toFixed(1)}`)
    .join(' ');
  const currentPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p.current).toFixed(1)}`)
    .join(' ');

  const gridFractions = [0, 0.25, 0.5, 0.75, 1];

  // Avoid crowding the x-axis when there are many points (e.g. a long
  // yearly history) by capping the number of visible labels.
  const labelStride = Math.max(1, Math.ceil(n / 8));

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', overflow: 'visible' }}
      role="img"
      aria-label="Invested amount vs current value over time"
    >
      {gridFractions.map((g) => {
        const gy = padTop + chartH - g * chartH;
        return (
          <g key={g}>
            <line
              x1={padLeft}
              y1={gy}
              x2={width - padRight}
              y2={gy}
              stroke="var(--hairline)"
              strokeWidth={1}
            />
            <text
              x={padLeft - 8}
              y={gy}
              textAnchor="end"
              dominantBaseline="middle"
              fontFamily="var(--font-mono)"
              fontSize="10.5"
              fill="var(--ink-faint)"
            >
              {formatCompactINR(niceMax * g)}
            </text>
          </g>
        );
      })}

      {points.map((p, i) => {
        if (i % labelStride !== 0 && i !== n - 1) return null;
        return (
          <text
            key={p.period}
            x={xAt(i)}
            y={height - 10}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="10.5"
            fill="var(--ink-faint)"
          >
            {formatPeriodLabel(p.period, periodType)}
          </text>
        );
      })}

      <path d={investedPath} fill="none" stroke="var(--brass)" strokeWidth={2} />
      <path d={currentPath} fill="none" stroke="var(--ledger-green)" strokeWidth={2.5} />

      {points.map((p, i) => (
        <circle key={`inv-${p.period}`} cx={xAt(i)} cy={yAt(p.invested)} r={3} fill="var(--brass)">
          <title>{`${p.period} \u00b7 Invested ${formatCompactINR(p.invested)}`}</title>
        </circle>
      ))}
      {points.map((p, i) => (
        <circle key={`cur-${p.period}`} cx={xAt(i)} cy={yAt(p.current)} r={3.5} fill="var(--ledger-green)">
          <title>{`${p.period} \u00b7 Current ${formatCompactINR(p.current)}`}</title>
        </circle>
      ))}
    </svg>
  );
}
