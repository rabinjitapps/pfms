'use client';

import { useState } from 'react';
import { BankAccountSummary } from '@/types';
import styles from './BankModals.module.css';

interface Props {
  accounts: BankAccountSummary[];
  defaultAccountId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

type Kind = 'credit' | 'debit' | 'transfer';

function fmtCurrency(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BankTransactionModal({ accounts, defaultAccountId, onClose, onSaved }: Props) {
  const [kind, setKind] = useState<Kind>('credit');
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.account.id ?? '');
  const [toAccountId, setToAccountId] = useState(
    accounts.find((a) => a.account.id !== (defaultAccountId ?? accounts[0]?.account.id))?.account.id ?? ''
  );
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNum = Number(amount);
  const fromBalance = accounts.find((a) => a.account.id === accountId)?.balance ?? 0;
  const previewBalance =
    amountNum > 0 ? (kind === 'debit' || kind === 'transfer' ? fromBalance - amountNum : fromBalance + amountNum) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!amountNum || amountNum <= 0) {
      setError('Amount must be positive.');
      return;
    }
    if (!date) {
      setError('Date is required.');
      return;
    }
    if (kind === 'transfer' && (!accountId || !toAccountId || accountId === toAccountId)) {
      setError('Pick two different accounts to transfer between.');
      return;
    }
    if (kind !== 'transfer' && !accountId) {
      setError('Pick an account.');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> =
        kind === 'transfer'
          ? {
              kind: 'transfer',
              from_account_id: accountId,
              to_account_id: toAccountId,
              date,
              amount: amountNum,
              description: description.trim() || undefined,
              category: category.trim() || undefined,
            }
          : {
              account_id: accountId,
              type: kind,
              date,
              amount: amountNum,
              description: description.trim() || undefined,
              category: category.trim() || undefined,
            };

      const res = await fetch('/api/bank-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save transaction.');
        return;
      }

      onSaved();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Add Transaction</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 20 20" fill="none" width={18} height={18}>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Type</label>
            <div className={styles.typeToggle}>
              <button
                type="button"
                className={kind === 'credit' ? `${styles.typeBtn} ${styles.typeBtnActiveCredit}` : styles.typeBtn}
                onClick={() => setKind('credit')}
              >
                Money In
              </button>
              <button
                type="button"
                className={kind === 'debit' ? `${styles.typeBtn} ${styles.typeBtnActiveDebit}` : styles.typeBtn}
                onClick={() => setKind('debit')}
              >
                Money Out
              </button>
              <button
                type="button"
                className={kind === 'transfer' ? `${styles.typeBtn} ${styles.typeBtnActive}` : styles.typeBtn}
                onClick={() => setKind('transfer')}
                disabled={accounts.length < 2}
                title={accounts.length < 2 ? 'Add a second account to transfer between accounts' : undefined}
              >
                Transfer
              </button>
            </div>
            {kind === 'transfer' && (
              <p className={styles.typeHint}>
                Records a debit on the first account and a matching credit on the second — both ledgers update together.
              </p>
            )}
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>{kind === 'transfer' ? 'From Account' : 'Account'}</label>
              <select className={styles.select} value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
                {accounts.map((a) => (
                  <option key={a.account.id} value={a.account.id}>
                    {a.account.name}
                  </option>
                ))}
              </select>
            </div>
            {kind === 'transfer' ? (
              <div className={styles.field}>
                <label className={styles.label}>To Account</label>
                <select
                  className={styles.select}
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  required
                >
                  {accounts
                    .filter((a) => a.account.id !== accountId)
                    .map((a) => (
                      <option key={a.account.id} value={a.account.id}>
                        {a.account.name}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <div className={styles.field}>
                <label className={styles.label}>Date</label>
                <input
                  className={styles.input}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
            )}
          </div>

          {kind === 'transfer' && (
            <div className={styles.field}>
              <label className={styles.label}>Date</label>
              <input
                className={styles.input}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          )}

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Amount (₹)</label>
              <input
                className={styles.input}
                type="number"
                min="0.01"
                step="0.01"
                placeholder="e.g. 5000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Category (optional)</label>
              <input
                className={styles.input}
                type="text"
                placeholder="e.g. Salary, Rent"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Description (optional)</label>
            <input
              className={styles.input}
              type="text"
              placeholder="e.g. June salary credit"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {previewBalance !== null && (
            <div className={styles.previewCard}>
              <div className={styles.previewRow}>
                <span className={styles.previewLabel}>
                  {accounts.find((a) => a.account.id === accountId)?.account.name} balance after
                </span>
                <span className={styles.previewValue}>{fmtCurrency(previewBalance)}</span>
              </div>
            </div>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving…' : 'Add Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
