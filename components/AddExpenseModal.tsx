'use client';

import { useState, useMemo } from 'react';
import { ExpenseCategory, ExpenseDirection, ExpenseEntry } from '@/types';
import { evaluateAmountExpr, hasOperator } from '@/lib/amountExpr';

interface BankAccountOption {
  id: string;
  name: string;
}

interface Props {
  categories: ExpenseCategory[];
  bankAccounts: BankAccountOption[];
  defaultDirection: ExpenseDirection;
  editingEntry?: ExpenseEntry | null;
  onClose: () => void;
  onSaved: (date: string) => void;
}

const NEW_HEAD_VALUE = '__new__';
const NO_ACCOUNT_VALUE = '';

export default function AddExpenseModal({
  categories,
  bankAccounts,
  defaultDirection,
  editingEntry = null,
  onClose,
  onSaved,
}: Props) {
  const isEditing = editingEntry !== null;

  const [direction, setDirection] = useState<ExpenseDirection>(
    editingEntry?.direction ?? defaultDirection
  );
  const [categoryId, setCategoryId] = useState(editingEntry?.category_id ?? '');
  const [newHeadName, setNewHeadName] = useState('');
  const [date, setDate] = useState(editingEntry?.date ?? new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(editingEntry ? String(editingEntry.amount) : '');
  const [notes, setNotes] = useState(editingEntry?.notes ?? '');
  const [accountId, setAccountId] = useState(editingEntry?.account_id ?? NO_ACCOUNT_VALUE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const kind = direction === 'INFLOW' ? 'INCOME' : 'EXPENSE';

  // The amount field accepts simple sums like "1200 + 350 - 50".
  const evaluatedAmount = useMemo(() => evaluateAmountExpr(amount), [amount]);
  const showCalcPreview = hasOperator(amount) && evaluatedAmount !== null;

  function appendOperator(op: '+' | '-') {
    setAmount((prev) => {
      const t = prev.trimEnd();
      if (t === '') return op === '-' ? '-' : prev; // a leading "+" is pointless
      // Swap a dangling operator instead of stacking them ("5 + -")
      if (/[+\-]$/.test(t)) return t.slice(0, -1).trimEnd() + ` ${op} `;
      return `${t} ${op} `;
    });
  }

  // Tidy the field to its result when the user leaves it ("100 + 50" -> "150")
  function collapseAmount() {
    if (hasOperator(amount) && evaluatedAmount !== null) setAmount(String(evaluatedAmount));
  }

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

    const amountNum = evaluatedAmount;
    if (amountNum === null) {
      setError(amount.trim() === '' ? 'Enter an amount greater than zero.' : 'Check the amount — use numbers with + or − between them.');
      return;
    }
    if (amountNum <= 0) {
      setError('The amount must come to more than zero.');
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

      const url = isEditing ? `/api/expense-entries/${editingEntry!.id}` : '/api/expense-entries';
      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: resolvedCategoryId,
          direction,
          date,
          amount: amountNum,
          notes: notes.trim() || null,
          accountId: accountId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Could not ${isEditing ? 'update' : 'save'} entry.`);
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
          <h2 style={styles.title}>{isEditing ? 'Edit entry' : 'Add an entry'}</h2>
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
          <label style={{ ...styles.label, flex: 1.5 }}>
            Amount (₹)
            <span style={styles.amountWrap}>
              <input
                style={{ ...styles.input, ...styles.amountInput }}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={collapseAmount}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    collapseAmount();
                  }
                }}
                placeholder="0.00 or 500+250"
              />
              <button
                type="button"
                style={styles.opBtn}
                onClick={() => appendOperator('+')}
                aria-label="Add"
                title="Add another amount"
              >
                +
              </button>
              <button
                type="button"
                style={styles.opBtn}
                onClick={() => appendOperator('-')}
                aria-label="Subtract"
                title="Subtract an amount"
              >
                −
              </button>
            </span>
            {showCalcPreview && (
              <span style={styles.calcPreview}>
                = ₹{evaluatedAmount!.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
          </label>
        </div>

        <label style={styles.label}>
          Bank account <span style={styles.optional}>(optional)</span>
          <select
            style={styles.input}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value={NO_ACCOUNT_VALUE}>No account — not tied to a bank</option>
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {bankAccounts.length > 0 && accountId && (
            <span style={styles.hint}>
              This will also show up as a {direction === 'INFLOW' ? 'credit' : 'debit'} on that account's ledger.
            </span>
          )}
        </label>

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
            {saving
              ? 'Saving…'
              : isEditing
              ? 'Save changes'
              : `Record ${direction === 'INFLOW' ? 'income' : 'expense'}`}
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
  hint: {
    display: 'block',
    fontSize: '11.5px',
    color: 'var(--ink-faint)',
    fontWeight: 400,
    marginTop: '6px',
  },
  amountWrap: {
    display: 'flex',
    gap: '6px',
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
  },
  opBtn: {
    width: '38px',
    flexShrink: 0,
    border: '1px solid var(--hairline)',
    borderRadius: '3px',
    background: 'var(--paper)',
    color: 'var(--ink)',
    fontSize: '18px',
    fontWeight: 600,
    lineHeight: 1,
  },
  calcPreview: {
    fontFamily: 'var(--font-mono)',
    fontSize: '12.5px',
    fontWeight: 600,
    color: 'var(--ledger-green)',
    marginTop: '2px',
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
