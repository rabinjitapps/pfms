'use client';

import { useEffect, useState } from 'react';
import { ExpenseHeadBreakdown, AnalysisPeriodType, ExpenseDirection } from '@/types';

interface Props {
  categoryId: string;
  categoryName: string;
  periodType: AnalysisPeriodType;
  period: string;
  direction: ExpenseDirection;
  periodLabel: string; // already-formatted, e.g. "April 2026" or "2026"
  onClose: () => void;
}

function formatINR(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatEntryDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ExpenseHeadBreakdownModal({
  categoryId,
  categoryName,
  periodType,
  period,
  direction,
  periodLabel,
  onClose,
}: Props) {
  const [data, setData] = useState<ExpenseHeadBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(
      `/api/expense-analysis/head-entries?categoryId=${encodeURIComponent(categoryId)}&periodType=${periodType}&period=${encodeURIComponent(period)}&direction=${direction}`
    )
      .then(async (res) => {
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the breakdown for this head.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId, periodType, period, direction]);

  const isIncome = direction === 'INFLOW';

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>{categoryName}</h2>
            <p style={styles.subtitle}>{periodLabel}</p>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        {loading ? (
          <p style={styles.hint}>Loading…</p>
        ) : error ? (
          <p style={styles.error}>{error}</p>
        ) : data && data.entries.length === 0 ? (
          <p style={styles.hint}>No entries found for this head in this period.</p>
        ) : data ? (
          <>
            <div style={styles.totalRow}>
              <span style={styles.totalLabel}>
                {data.entries.length} {data.entries.length === 1 ? 'entry' : 'entries'}
              </span>
              <span style={isIncome ? styles.totalValueIn : styles.totalValueOut}>
                ₹{formatINR(data.total)}
              </span>
            </div>

            <div style={styles.entryList}>
              {data.entries.map((e) => (
                <div key={e.id} style={styles.entryRow}>
                  <div style={styles.entryMain}>
                    <span style={styles.entryDate}>{formatEntryDate(e.date)}</span>
                    {(e.notes || e.account?.name) && (
                      <span style={styles.entryNotes}>
                        {e.notes}
                        {e.notes && e.account?.name ? ' · ' : ''}
                        {e.account?.name ? `via ${e.account.name}` : ''}
                      </span>
                    )}
                  </div>
                  <span style={isIncome ? styles.entryAmountIn : styles.entryAmountOut}>
                    ₹{formatINR(Number(e.amount))}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : null}

        <div style={styles.actions}>
          <button style={styles.closeFooterBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(28, 27, 25, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    zIndex: 100,
  },
  modal: {
    width: '100%',
    maxWidth: '480px',
    maxHeight: '85vh',
    overflowY: 'auto',
    background: 'var(--paper-raised)',
    border: '1px solid var(--hairline)',
    borderRadius: '6px',
    padding: '28px',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '18px',
    gap: '12px',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '21px',
    fontWeight: 600,
    color: 'var(--ink)',
    margin: 0,
  },
  subtitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    color: 'var(--ink-faint)',
    margin: '4px 0 0',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '22px',
    color: 'var(--ink-faint)',
    lineHeight: 1,
    padding: '4px',
    flexShrink: 0,
  },
  hint: {
    fontSize: '13px',
    color: 'var(--ink-faint)',
    lineHeight: 1.5,
  },
  error: {
    fontSize: '13px',
    color: 'var(--brick)',
    margin: 0,
  },
  totalRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    padding: '12px 14px',
    background: 'var(--paper)',
    border: '1px solid var(--hairline)',
    borderRadius: '4px',
    marginBottom: '14px',
  },
  totalLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '11.5px',
    color: 'var(--ink-faint)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  totalValueIn: {
    fontFamily: 'var(--font-mono)',
    fontSize: '17px',
    fontWeight: 700,
    color: 'var(--ledger-green)',
  },
  totalValueOut: {
    fontFamily: 'var(--font-mono)',
    fontSize: '17px',
    fontWeight: 700,
    color: 'var(--brick)',
  },
  entryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '360px',
    overflowY: 'auto',
  },
  entryRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 12px',
    border: '1px solid var(--hairline)',
    borderRadius: '4px',
    background: 'var(--paper)',
  },
  entryMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  },
  entryDate: {
    fontFamily: 'var(--font-mono)',
    fontSize: '12.5px',
    fontWeight: 600,
    color: 'var(--ink)',
  },
  entryNotes: {
    fontSize: '12px',
    color: 'var(--ink-faint)',
  },
  entryAmountIn: {
    fontFamily: 'var(--font-mono)',
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--ledger-green)',
    whiteSpace: 'nowrap',
  },
  entryAmountOut: {
    fontFamily: 'var(--font-mono)',
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--brick)',
    whiteSpace: 'nowrap',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '18px',
  },
  closeFooterBtn: {
    padding: '10px 16px',
    background: 'none',
    border: '1px solid var(--hairline)',
    borderRadius: '3px',
    fontSize: '14px',
    color: 'var(--ink-soft)',
  },
};
