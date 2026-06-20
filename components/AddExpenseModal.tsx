'use client';

import { useState, useMemo } from 'react';
import { ExpenseCategory, ExpenseDirection } from '@/types';

interface Props {
  categories: ExpenseCategory[];
  defaultDirection: ExpenseDirection;
  onClose: () => void;
  onSaved: (date: string) => void;
}

const NEW_HEAD_VALUE = '__new__';

export default function AddExpenseModal({ categories, defaultDirection, onClose, onSaved }: Props) {
  const [direction, setDirection] = useState<ExpenseDirection>(defaultDirection);
  const [categoryId, setCategoryId] = useState('');
  const [newHeadName, setNewHeadName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const kind = direction === 'INFLOW' ? 'INCOME' : 'EXPENSE';

  const headsForDirection = useMemo(
    () => categories.filter((c) => c.kind === kind),
    [categories, kind]
  );

  // Switching direction can leave a stale category selected from the
  // other head list — reset to the placeholder so a save can't silently
  // file an expense under an income head or vice versa.
  function handleDirectionChange(next: ExpenseDirection) {
    setDirection(next);
    setCategoryId('');
    setNewHeadName('');
  }

  async function handleSubmit() {
    setError('');

    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (categoryId !== NEW_HEAD_VALUE && !categoryId) {
      setError('Choose a head, or add a new one.');
      return;
    }
    if (categoryId === NEW_HEAD_VALUE && !newHeadName.trim()) {
      setError('Enter a name for the new head.');
      return;
    }

    setSaving(true);
    try {
      let resolvedCategoryId = categoryId;

      if (categoryId === NEW_HEAD_VALUE) {
        const headRes = await fetch('/api/expense-categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newHeadName.trim(), kind }),
        });
        const headData = await headRes.json();
        if (!headRes.ok) {
          setError(headData.error || 'Could not create head.');
          return;
        }
        resolvedCategoryId = headData.category.id;
      }

      const res = await fetch('/api/expense-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: resolvedCategoryId,
          direction,
          date,
          amount: amountNum,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save entry.');
        return;
      }
      onSaved(date);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Add an entry</h2>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div style={styles.typeToggle}>
          <button
            style={direction === 'INFLOW' ? styles.typeBtnActiveIn : styles.typeBtn}
            onClick={() => handleDirectionChange('INFLOW')}
          >
            Income (inflow)
          </button>
          <button
            style={direction === 'OUTFLOW' ? styles.typeBtnActiveOut : styles.typeBtn}
            onClick={() => handleDirectionChange('OUTFLOW')}
          >
            Expense (outflow)
          </button>
        </div>

        <label style={styles.label}>
          {kind === 'INCOME' ? 'Income head' : 'Expense head'}
          <select
            style={styles.input}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Select a head…</option>
            {headsForDirection.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NEW_HEAD_VALUE}>+ Add new head…</option>
          </select>
        </label>

        {categoryId === NEW_HEAD_VALUE && (
          <label style={styles.label}>
            New head name
            <input
              style={styles.input}
              type="text"
              value={newHeadName}
              onChange={(e) => setNewHeadName(e.target.value)}
              placeholder={kind === 'INCOME' ? 'e.g. Salary, Freelance' : 'e.g. Groceries, Rent'}
              autoFocus
            />
          </label>
        )}

        <div style={styles.row}>
          <label style={styles.label}>
            Date
            <input
              style={styles.input}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label style={styles.label}>
            Amount (₹)
            <input
              style={styles.input}
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </label>
        </div>

        <label style={styles.label}>
          Notes <span style={styles.optional}>(optional)</span>
          <input
            style={styles.input}
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Monthly grocery run"
          />
        </label>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={direction === 'INFLOW' ? styles.submitBtnIn : styles.submitBtnOut}
            disabled={saving}
            onClick={handleSubmit}
          >
            {saving ? 'Saving…' : `Record ${direction === 'INFLOW' ? 'income' : 'expense'}`}
          </button>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '22px',
    fontWeight: 600,
    color: 'var(--ink)',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '22px',
    color: 'var(--ink-faint)',
    lineHeight: 1,
    padding: '4px',
  },
  typeToggle: {
    display: 'flex',
    gap: '8px',
    marginBottom: '18px',
  },
  typeBtn: {
    flex: 1,
    padding: '9px',
    border: '1px solid var(--hairline)',
    borderRadius: '4px',
    background: 'var(--paper)',
    color: 'var(--ink-soft)',
    fontSize: '13.5px',
    fontWeight: 600,
  },
  typeBtnActiveIn: {
    flex: 1,
    padding: '9px',
    border: '1px solid var(--ledger-green)',
    borderRadius: '4px',
    background: 'var(--ledger-green-soft)',
    color: 'var(--ledger-green)',
    fontSize: '13.5px',
    fontWeight: 600,
  },
  typeBtnActiveOut: {
    flex: 1,
    padding: '9px',
    border: '1px solid var(--brick)',
    borderRadius: '4px',
    background: 'var(--brick-soft)',
    color: 'var(--brick)',
    fontSize: '13.5px',
    fontWeight: 600,
  },
  row: {
    display: 'flex',
    gap: '12px',
  },
  label: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '13px',
    color: 'var(--ink-soft)',
    fontWeight: 500,
    marginBottom: '16px',
  },
  optional: {
    color: 'var(--ink-faint)',
    fontWeight: 400,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '15px',
    border: '1px solid var(--hairline)',
    borderRadius: '3px',
    background: 'var(--paper)',
    color: 'var(--ink)',
  },
  error: {
    fontSize: '13px',
    color: 'var(--brick)',
    margin: '0 0 12px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '8px',
  },
  cancelBtn: {
    padding: '10px 16px',
    background: 'none',
    border: '1px solid var(--hairline)',
    borderRadius: '3px',
    fontSize: '14px',
    color: 'var(--ink-soft)',
  },
  submitBtnIn: {
    padding: '10px 18px',
    background: 'var(--ledger-green)',
    border: 'none',
    borderRadius: '3px',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--paper-raised)',
  },
  submitBtnOut: {
    padding: '10px 18px',
    background: 'var(--brick)',
    border: 'none',
    borderRadius: '3px',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--paper-raised)',
  },
};
