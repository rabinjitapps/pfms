'use client';

import { useState } from 'react';
import { ExpenseCategory, ExpenseCategoryKind } from '@/types';

interface Props {
  incomeHeads: ExpenseCategory[];
  expenseHeads: ExpenseCategory[];
  onClose: () => void;
  onChanged: () => void;
}

export default function ManageHeadsModal({ incomeHeads, expenseHeads, onClose, onChanged }: Props) {
  const [kind, setKind] = useState<ExpenseCategoryKind>('EXPENSE');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const list = kind === 'INCOME' ? incomeHeads : expenseHeads;

  async function handleAdd() {
    setError('');
    if (!name.trim()) {
      setError('Enter a head name.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/expense-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), kind }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not add head.');
        return;
      }
      setName('');
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setError('');
    const res = await fetch(`/api/expense-categories/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not delete head.');
      return;
    }
    onChanged();
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Manage heads</h2>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div style={styles.tabs}>
          <button
            style={kind === 'EXPENSE' ? styles.tabActive : styles.tab}
            onClick={() => setKind('EXPENSE')}
          >
            Expense heads
          </button>
          <button
            style={kind === 'INCOME' ? styles.tabActive : styles.tab}
            onClick={() => setKind('INCOME')}
          >
            Income heads
          </button>
        </div>

        <div style={styles.addRow}>
          <input
            style={styles.input}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'INCOME' ? 'e.g. Salary' : 'e.g. Groceries'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
          />
          <button style={styles.addBtn} onClick={handleAdd} disabled={saving}>
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        {list.length === 0 ? (
          <p style={styles.hint}>
            No {kind === 'INCOME' ? 'income' : 'expense'} heads yet — add one above.
          </p>
        ) : (
          <div style={styles.headsList}>
            {list.map((c) => (
              <div key={c.id} style={styles.headRow}>
                <span style={styles.headName}>{c.name}</span>
                <button style={styles.deleteBtn} onClick={() => handleDelete(c.id)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onClose}>Close</button>
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
    maxWidth: '440px',
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
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '18px',
    borderBottom: '1px solid var(--hairline)',
  },
  tab: {
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '8px 4px 10px',
    fontSize: '14px',
    color: 'var(--ink-faint)',
    fontWeight: 500,
  },
  tabActive: {
    background: 'none',
    border: 'none',
    borderBottom: '2px solid var(--ledger-green)',
    padding: '8px 4px 10px',
    fontSize: '14px',
    color: 'var(--ink)',
    fontWeight: 600,
  },
  addRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '14px',
  },
  input: {
    flex: 1,
    width: '100%',
    padding: '10px 12px',
    fontSize: '15px',
    border: '1px solid var(--hairline)',
    borderRadius: '3px',
    background: 'var(--paper)',
    color: 'var(--ink)',
  },
  addBtn: {
    padding: '10px 16px',
    background: 'var(--ledger-green)',
    border: 'none',
    borderRadius: '3px',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--paper-raised)',
    whiteSpace: 'nowrap',
  },
  error: {
    fontSize: '13px',
    color: 'var(--brick)',
    margin: '0 0 12px',
  },
  hint: {
    fontSize: '13px',
    color: 'var(--ink-faint)',
    lineHeight: 1.5,
  },
  headsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '280px',
    overflowY: 'auto',
  },
  headRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '9px 12px',
    border: '1px solid var(--hairline)',
    borderRadius: '4px',
    background: 'var(--paper)',
  },
  headName: {
    fontSize: '14px',
    color: 'var(--ink)',
    fontWeight: 500,
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    fontSize: '11px',
    color: 'var(--ink-faint)',
    textDecoration: 'underline',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '18px',
  },
  cancelBtn: {
    padding: '10px 16px',
    background: 'none',
    border: '1px solid var(--hairline)',
    borderRadius: '3px',
    fontSize: '14px',
    color: 'var(--ink-soft)',
  },
};
