'use client';

import { useState, useEffect } from 'react';
import { CreditCard } from '@/types';
import styles from './BankModals.module.css';

interface Props {
  existing: CreditCard | null;
  onClose: () => void;
  onSaved: (card: CreditCard) => void;
}

const CARD_NETWORKS = ['Visa', 'Mastercard', 'Rupay', 'Amex', 'Diners', 'Other'];

function dayOptions(): number[] {
  return Array.from({ length: 31 }, (_, i) => i + 1);
}

export default function AddCreditCardModal({ existing, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [bankName, setBankName] = useState('');
  const [cardNetwork, setCardNetwork] = useState('Visa');
  const [last4, setLast4] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [statementDay, setStatementDay] = useState('1');
  const [dueDay, setDueDay] = useState('15');
  const [openingBalance, setOpeningBalance] = useState('');
  const [openingDate, setOpeningDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [statementBalance, setStatementBalance] = useState('');
  const [minimumDue, setMinimumDue] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setBankName(existing.bank_name ?? '');
      setCardNetwork(existing.card_network ?? 'Visa');
      setLast4(existing.card_number_last4 ?? '');
      setCreditLimit(String(existing.credit_limit));
      setStatementDay(String(existing.statement_day));
      setDueDay(String(existing.due_day));
      setOpeningBalance(String(existing.opening_balance));
      setOpeningDate(existing.opening_date);
      setStatementBalance(existing.current_statement_balance != null ? String(existing.current_statement_balance) : '');
      setMinimumDue(existing.current_minimum_due != null ? String(existing.current_minimum_due) : '');
      setNotes(existing.notes ?? '');
    }
  }, [existing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Card name is required.');
      return;
    }

    setSaving(true);
    try {
      const url = existing ? `/api/credit-cards/${existing.id}` : '/api/credit-cards';
      const method = existing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          bank_name: bankName.trim() || null,
          card_network: cardNetwork,
          card_number_last4: last4.trim() || null,
          credit_limit: Number(creditLimit) || 0,
          statement_day: Number(statementDay) || 1,
          due_day: Number(dueDay) || 1,
          opening_balance: Number(openingBalance) || 0,
          opening_date: openingDate,
          current_statement_balance: statementBalance.trim() === '' ? null : Number(statementBalance),
          current_minimum_due: minimumDue.trim() === '' ? null : Number(minimumDue),
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save credit card.');
        return;
      }

      onSaved(data.card);
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
          <h2 className={styles.modalTitle}>{existing ? 'Edit Credit Card' : 'Add Credit Card'}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 20 20" fill="none" width={18} height={18}>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Card Name</label>
            <input
              className={styles.input}
              type="text"
              placeholder="e.g. HDFC Regalia"
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
              <label className={styles.label}>Network</label>
              <select className={styles.select} value={cardNetwork} onChange={(e) => setCardNetwork(e.target.value)}>
                {CARD_NETWORKS.map((n) => (
                  <option key={n} value={n}>
                    {n}
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
              <label className={styles.label}>Credit Limit (₹)</label>
              <input
                className={styles.input}
                type="number"
                step="0.01"
                placeholder="e.g. 200000"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Statement Day</label>
              <select className={styles.select} value={statementDay} onChange={(e) => setStatementDay(e.target.value)}>
                {dayOptions().map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <p className={styles.typeHint}>Day of month your statement is generated.</p>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Due Day</label>
              <select className={styles.select} value={dueDay} onChange={(e) => setDueDay(e.target.value)}>
                {dayOptions().map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <p className={styles.typeHint}>Day of month payment is due.</p>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Opening Balance (₹)</label>
              <input
                className={styles.input}
                type="number"
                step="0.01"
                placeholder="e.g. 15000"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
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
          <p className={styles.typeHint} style={{ marginTop: '-8px' }}>
            What you owed on this card on the opening date, before any spends/payments you log here.
          </p>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Current Statement Balance (optional)</label>
              <input
                className={styles.input}
                type="number"
                step="0.01"
                placeholder="e.g. 18500"
                value={statementBalance}
                onChange={(e) => setStatementBalance(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Current Minimum Due (optional)</label>
              <input
                className={styles.input}
                type="number"
                step="0.01"
                placeholder="e.g. 925"
                value={minimumDue}
                onChange={(e) => setMinimumDue(e.target.value)}
              />
            </div>
          </div>
          <p className={styles.typeHint} style={{ marginTop: '-8px' }}>
            From your latest statement — entered manually here since the minimum-due formula varies by issuer and offers/EMIs can change it.
          </p>

          <div className={styles.field}>
            <label className={styles.label}>Notes (optional)</label>
            <input
              className={styles.input}
              type="text"
              placeholder="e.g. Annual fee waiver on ₹3L spend"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving…' : existing ? 'Update Card' : 'Add Card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
