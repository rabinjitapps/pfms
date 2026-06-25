'use client';

import { useRef, useState, useCallback } from 'react';
import { FundGrowthPoint, FundGrowthPeriodType } from '@/types';

interface Props {
  points: FundGrowthPoint[];
  periodType: FundGrowthPeriodType;
  benchmarkValues?: number[]; // same length/order as points, optional 3rd line
  benchmarkLabel?: string;
}

function formatCompactINR(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}k`;
  return `${sign}₹${abs.toFixed(0)}`;
}

function formatFullINR(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatPeriodLabel(period: string, periodType: FundGrowthPeriodType): string {
  if (periodType === 'year') return period;
  const m = Number(period.split('-')[1]);
  const d = new Date(2000, m - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'short' });
}

// The calendar date a period's value represents — last day of the month for
// monthly points, Dec 31 for yearly points. Used only to build a continuous,
// human-readable date label while hovering between two points.
function periodAnchorDate(period: string, periodType: FundGrowthPeriodType): Date {
  if (periodType === 'year') return new Date(Number(period), 11, 31);
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m, 0); // day 0 of next month = last day of this month
}

// Picks a "nice" round number at or above `value` for the chart's top
// gridline, so the y-axis doesn't end on an awkward figure like ₹83,412.
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const step = magnitude / 2;
  return Math.ceil(value / step) * step;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export default function FundGrowthChart({ points, periodType, benchmarkValues, benchmarkLabel }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverFrac, setHoverFrac] = useState<number | null>(null); // 0..n-1, fractional index

  if (points.length === 0) return null;

  const width = 720;
  const height = 280;
  const padLeft = 60;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 32;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const allVals = points.flatMap((p) => [p.invested, p.current]);
  if (benchmarkValues) allVals.push(...benchmarkValues.filter((v) => Number.isFinite(v)));
  const maxVal = Math.max(1, ...allVals);
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
  const benchmarkPath = benchmarkValues
    ? benchmarkValues.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(' ')
    : null;

  const gridFractions = [0, 0.25, 0.5, 0.75, 1];

  // Avoid crowding the x-axis when there are many points (e.g. a long
  // yearly history) by capping the number of visible labels.
  const labelStride = Math.max(1, Math.ceil(n / 8));

  const handleMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || n < 1) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return;
      const fracX = (e.clientX - rect.left) / rect.width;
      const xSvg = fracX * width;
      const clampedX = Math.min(Math.max(xSvg, padLeft), width - padRight);
      const idx = n <= 1 ? 0 : ((clampedX - padLeft) / chartW) * (n - 1);
      setHoverFrac(Math.min(Math.max(idx, 0), n - 1));
    },
    [n, chartW, padLeft, width, padRight]
  );

  const handleLeave = useCallback(() => setHoverFrac(null), []);

  // Interpolated values at the exact mouse position — not snapped to the
  // nearest plotted point — plus a continuous "as of" date label.
  let hover: {
    x: number;
    invested: number;
    current: number;
    benchmark: number | null;
    dateLabel: string;
  } | null = null;

  if (hoverFrac !== null) {
    const lo = Math.floor(hoverFrac);
    const hi = Math.min(lo + 1, n - 1);
    const t = hoverFrac - lo;
    const invested = lerp(points[lo].invested, points[hi].invested, t);
    const current = lerp(points[lo].current, points[hi].current, t);
    const benchmark = benchmarkValues ? lerp(benchmarkValues[lo], benchmarkValues[hi], t) : null;

    const loDate = periodAnchorDate(points[lo].period, periodType).getTime();
    const hiDate = periodAnchorDate(points[hi].period, periodType).getTime();
    const interpDate = new Date(lerp(loDate, hiDate, t));
    const dateLabel = interpDate.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    hover = { x: xAt(hoverFrac), invested, current, benchmark, dateLabel };
  }

  // Keep the floating tooltip box from running off either edge of the chart.
  const tooltipWidth = 168;
  const tooltipX = hover ? Math.min(Math.max(hover.x + 10, padLeft), width - padRight - tooltipWidth) : 0;

  return (
    <svg
      ref={svgRef}
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }}
      role="img"
      aria-label="Invested amount vs current value over time"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
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

      {benchmarkPath && (
        <path d={benchmarkPath} fill="none" stroke="var(--ink-faint)" strokeWidth={1.75} strokeDasharray="5 4" />
      )}
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

      {hover && (
        <g pointerEvents="none">
          <line
            x1={hover.x}
            y1={padTop}
            x2={hover.x}
            y2={padTop + chartH}
            stroke="var(--ink-faint)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <circle cx={hover.x} cy={yAt(hover.invested)} r={4} fill="var(--brass)" stroke="var(--paper-raised)" strokeWidth={1.5} />
          <circle cx={hover.x} cy={yAt(hover.current)} r={4.5} fill="var(--ledger-green)" stroke="var(--paper-raised)" strokeWidth={1.5} />
          {hover.benchmark !== null && (
            <circle cx={hover.x} cy={yAt(hover.benchmark)} r={4} fill="var(--ink-faint)" stroke="var(--paper-raised)" strokeWidth={1.5} />
          )}

          <foreignObject x={tooltipX} y={padTop} width={tooltipWidth} height={benchmarkValues ? 92 : 72}>
            <div
              style={{
                background: 'var(--paper-raised)',
                border: '1px solid var(--hairline)',
                borderRadius: 4,
                padding: '7px 9px',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                lineHeight: 1.55,
                boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
              }}
            >
              <div style={{ color: 'var(--ink-faint)', marginBottom: 3, fontSize: 10.5 }}>{hover.dateLabel}</div>
              <div style={{ color: 'var(--brass)' }}>Invested {formatFullINR(hover.invested)}</div>
              <div style={{ color: 'var(--ledger-green)', fontWeight: 600 }}>Value {formatFullINR(hover.current)}</div>
              {hover.benchmark !== null && (
                <div style={{ color: 'var(--ink-faint)' }}>
                  {benchmarkLabel ?? 'Benchmark'} {formatFullINR(hover.benchmark)}
                </div>
              )}
            </div>
          </foreignObject>
        </g>
      )}
    </svg>
  );
}
