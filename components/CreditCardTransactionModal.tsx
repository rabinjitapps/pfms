'use client';

import { useState } from 'react';
import { CreditCardSummary, ExpenseCategory } from '@/types';
import styles from './BankModals.module.css';

interface Props {
  cards: CreditCardSummary[];
  expenseCategories: ExpenseCategory[];
  bankAccounts: { id: string; name: string }[];
  defaultCardId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

type Kind = 'spend' | 'payment' | 'refund';

function fmtCurrency(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CreditCardTransactionModal({
  cards,
  expenseCategories,
  bankAccounts,
  defaultCardId,
  onClose,
  onSaved,
}: Props) {
  const [kind, setKind] = useState<Kind>('spend');
  const [cardId, setCardId] = useState(defaultCardId ?? cards[0]?.card.id ?? '');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [expenseCategoryId, setExpenseCategoryId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expenseHeads = expenseCategories.filter((c) => c.kind === 'EXPENSE');

  const amountNum = Number(amount);
  const currentCard = cards.find((c) => c.card.id === cardId);
  const currentBalance = currentCard?.balance ?? 0;
  const previewBalance =
    amountNum > 0 ? (kind === 'spend' ? currentBalance + amountNum : currentBalance - amountNum) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!cardId) {
      setError('Pick a card.');
      return;
    }
    if (!amountNum || amountNum <= 0) {
      setError('Amount must be positive.');
      return;
    }
    if (!date) {
      setError('Date is required.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/credit-card-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: cardId,
          type: kind,
          date,
          amount: amountNum,
          description: description.trim() || undefined,
          category: category.trim() || undefined,
          expense_category_id: kind === 'spend' && expenseCategoryId ? expenseCategoryId : undefined,
          bank_account_id: kind === 'payment' && bankAccountId ? bankAccountId : undefined,
        }),
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
          <h2 className={styles.modalTitle}>Add Credit Card Transaction</h2>
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
                className={kind === 'spend' ? `${styles.typeBtn} ${styles.typeBtnActiveDebit}` : styles.typeBtn}
                onClick={() => setKind('spend')}
              >
                Spend
              </button>
              <button
                type="button"
                className={kind === 'payment' ? `${styles.typeBtn} ${styles.typeBtnActiveCredit}` : styles.typeBtn}
                onClick={() => setKind('payment')}
              >
                Payment
              </button>
              <button
                type="button"
                className={kind === 'refund' ? `${styles.typeBtn} ${styles.typeBtnActive}` : styles.typeBtn}
                onClick={() => setKind('refund')}
              >
                Refund
              </button>
            </div>
            <p className={styles.typeHint}>
              {kind === 'spend'
                ? 'Raises what you owe on this card.'
                : kind === 'payment'
                ? 'Lowers what you owe — money paid toward the card.'
                : 'Lowers what you owe — a merchant refund or reversal.'}
            </p>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Card</label>
              <select className={styles.select} value={cardId} onChange={(e) => setCardId(e.target.value)} required>
                {cards.map((c) => (
                  <option key={c.card.id} value={c.card.id}>
                    {c.card.name}
                  </option>
                ))}
              </select>
            </div>
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
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Amount (₹)</label>
              <input
                className={styles.input}
                type="number"
                min="0.01"
                step="0.01"
                placeholder="e.g. 2500"
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
                placeholder="e.g. Dining, Shopping"
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
              placeholder="e.g. Amazon order"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {kind === 'spend' && (
            <div className={styles.field}>
              <label className={styles.label}>
                Also log as an expense <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span>
              </label>
              <select
                className={styles.select}
                value={expenseCategoryId}
                onChange={(e) => setExpenseCategoryId(e.target.value)}
              >
                <option value="">Don&apos;t log to Expenses</option>
                {expenseHeads.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
              {expenseCategoryId && (
                <p className={styles.typeHint}>
                  This will also show up as an expense entry, so it counts toward that head in Expense Analysis.
                </p>
              )}
            </div>
          )}

          {kind === 'payment' && (
            <div className={styles.field}>
              <label className={styles.label}>
                Paid from bank account <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span>
              </label>
              <select className={styles.select} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                <option value="">Don&apos;t link to a bank account</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {bankAccountId && (
                <p className={styles.typeHint}>
                  This will also show up as a debit on that account&apos;s ledger, so its balance reflects the payment.
                </p>
              )}
            </div>
          )}

          {previewBalance !== null && currentCard && (
            <div className={styles.previewCard}>
              <div className={styles.previewRow}>
                <span className={styles.previewLabel}>{currentCard.card.name} balance after</span>
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
