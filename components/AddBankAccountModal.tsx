'use client';

import { useState, useEffect } from 'react';
import { BankAccount } from '@/types';
import styles from './BankModals.module.css';

interface Props {
  existing: BankAccount | null;
  onClose: () => void;
  onSaved: (account: BankAccount) => void;
}

const ACCOUNT_TYPES = ['Savings', 'Current', 'Salary', 'Fixed Deposit', 'Other'];

export default function AddBankAccountModal({ existing, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountType, setAccountType] = useState('Savings');
  const [last4, setLast4] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [openingDate, setOpeningDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setBankName(existing.bank_name ?? '');
      setAccountType(existing.account_type ?? 'Savings');
      setLast4(existing.account_number_last4 ?? '');
      setOpeningBalance(String(existing.opening_balance));
      setOpeningDate(existing.opening_date);
    }
  }, [existing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Account name is required.');
      return;
    }

    setSaving(true);
    try {
      const url = existing ? `/api/bank-accounts/${existing.id}` : '/api/bank-accounts';
      const method = existing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          bank_name: bankName.trim() || null,
          account_type: accountType,
          account_number_last4: last4.trim() || null,
          opening_balance: Number(openingBalance) || 0,
          opening_date: openingDate,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save bank account.');
        return;
      }

      onSaved(data.account);
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
          <h2 className={styles.modalTitle}>{existing ? 'Edit Account' : 'Add Bank Account'}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 20 20" fill="none" width={18} height={18}>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Account Name</label>
            <input
              className={styles.input}
              type="text"
              placeholder="e.g. HDFC Salary Account"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Bank Name</label>
              <input
                className={styles.input}
                type="text"
                placeholder="e.g. HDFC Bank"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Account Type</label>
              <select
                className={styles.select}
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Last 4 Digits (optional)</label>
              <input
                className={styles.input}
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="e.g. 4321"
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Opening Date</label>
              <input
                className={styles.input}
                type="date"
                value={openingDate}
                onChange={(e) => setOpeningDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Opening Balance (₹)</label>
            <input
              className={styles.input}
              type="number"
              step="0.01"
              placeholder="e.g. 25000"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
            />
            <p className={styles.typeHint}>
              The balance this account had on the opening date, before any transactions you log here.
            </p>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving…' : existing ? 'Update Account' : 'Add Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
