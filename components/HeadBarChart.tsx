'use client';

import { ExpenseHeadTotal, ExpenseDirection } from '@/types';

interface Props {
  totals: ExpenseHeadTotal[];
  maxTotal: number;
  direction: ExpenseDirection;
}

function formatCompactINR(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n.toFixed(0)}`;
}

// Horizontal bars read better than vertical ones here since head names
// vary a lot in length and the list can run to a dozen+ rows — vertical
// bars would force tiny rotated labels, horizontal bars don't.
export default function HeadBarChart({ totals, maxTotal, direction }: Props) {
  const barColor = direction === 'INFLOW' ? 'var(--ledger-green)' : 'var(--brick)';
  const trackColor = direction === 'INFLOW' ? 'var(--ledger-green-soft)' : 'var(--brick-soft)';

  const rowHeight = 34;
  const gap = 10;
  const labelWidth = 150;
  const chartWidth = 480;
  const height = totals.length * (rowHeight + gap) - gap;
  const width = labelWidth + chartWidth + 70;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${Math.max(height, rowHeight)}`}
      style={{ display: 'block', overflow: 'visible' }}
      role="img"
      aria-label={`Bar chart of ${direction === 'INFLOW' ? 'income' : 'expense'} heads`}
    >
      {totals.map((t, i) => {
        const y = i * (rowHeight + gap);
        const barW = maxTotal > 0 ? (t.total / maxTotal) * chartWidth : 0;
        return (
          <g key={t.categoryId} transform={`translate(0, ${y})`}>
            <text
              x={labelWidth - 10}
              y={rowHeight / 2}
              textAnchor="end"
              dominantBaseline="middle"
              fontFamily="var(--font-body)"
              fontSize="13"
              fontWeight="500"
              fill="var(--ink-soft)"
            >
              {t.categoryName.length > 20 ? `${t.categoryName.slice(0, 19)}…` : t.categoryName}
            </text>
            <rect
              x={labelWidth}
              y={(rowHeight - 18) / 2}
              width={chartWidth}
              height={18}
              rx={3}
              fill={trackColor}
            />
            <rect
              x={labelWidth}
              y={(rowHeight - 18) / 2}
              width={Math.max(barW, 2)}
              height={18}
              rx={3}
              fill={barColor}
            />
            <text
              x={labelWidth + Math.max(barW, 2) + 8}
              y={rowHeight / 2}
              dominantBaseline="middle"
              fontFamily="var(--font-mono)"
              fontSize="12"
              fontWeight="600"
              fill="var(--ink)"
            >
              {formatCompactINR(t.total)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
