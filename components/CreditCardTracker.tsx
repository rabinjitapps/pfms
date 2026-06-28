'use client';

import { useState, useEffect, useCallback } from 'react';
import AppShell from './AppShell';
import AddCreditCardModal from './AddCreditCardModal';
import CreditCardTransactionModal from './CreditCardTransactionModal';
import styles from './CreditCardTracker.module.css';
import modalStyles from './BankModals.module.css';
import {
  CreditCard,
  CreditCardSummary,
  CreditCardLedgerEntry,
  CreditCardPortfolioSummary,
  ExpenseCategory,
} from '@/types';

interface Props {
  displayName: string;
}

function fmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCurrency(n: number): string {
  return (n < 0 ? '-₹' : '₹') + fmt(Math.abs(n));
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function utilizationColor(pct: number): string {
  if (pct >= 80) return 'var(--brick)';
  if (pct >= 40) return 'var(--brass)';
  return 'var(--ledger-green)';
}

// ── Edit modal for a single plain (unlinked) credit card transaction ──
// Spends linked to an expense entry, or payments linked to a bank
// transaction, are edited from those pages instead — see the API route.
function EditCardTransactionModal({
  transaction,
  onClose,
  onSaved,
}: {
  transaction: CreditCardLedgerEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(transaction.date);
  const [amount, setAmount] = useState(String(transaction.amount));
  const [description, setDescription] = useState(transaction.description ?? '');
  const [category, setCategory] = useState(transaction.category ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      setError('Amount must be positive.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/credit-card-transactions/${transaction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          amount: amountNum,
          description: description.trim() || null,
          category: category.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update transaction.');
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
    <div className={modalStyles.backdrop} onClick={onClose}>
      <div className={modalStyles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={modalStyles.modalHeader}>
          <h2 className={modalStyles.modalTitle}>Edit Transaction</h2>
          <button className={modalStyles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 20 20" fill="none" width={18} height={18}>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {error && <div className={modalStyles.errorBanner}>{error}</div>}
        <form onSubmit={handleSubmit} className={modalStyles.form}>
          <div className={modalStyles.row}>
            <div className={modalStyles.field}>
              <label className={modalStyles.label}>Date</label>
              <input
                className={modalStyles.input}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className={modalStyles.field}>
              <label className={modalStyles.label}>Amount (₹)</label>
              <input
                className={modalStyles.input}
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>
          <div className={modalStyles.field}>
            <label className={modalStyles.label}>Category (optional)</label>
            <input
              className={modalStyles.input}
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
          <div className={modalStyles.field}>
            <label className={modalStyles.label}>Description (optional)</label>
            <input
              className={modalStyles.input}
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className={modalStyles.actions}>
            <button type="button" className={modalStyles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={modalStyles.saveBtn} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CardCard({
  summary,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
}: {
  summary: CreditCardSummary;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: (card: CreditCard) => void;
  onDelete: (id: string) => void;
  onAddTransaction: (cardId: string) => void;
  onEditTransaction: (t: CreditCardLedgerEntry) => void;
  onDeleteTransaction: (id: string) => void;
}) {
  const { card, balance, available_credit, utilization_pct, total_spend, total_payments, transactions } = summary;
  const recentFirst = [...transactions].reverse();
  const utilColor = utilizationColor(utilization_pct);

  return (
    <div className={styles.accountCard}>
      <div className={styles.accountCardHeader}>
        <div className={styles.accountCardTitle}>
          <h3 className={styles.accountName}>{card.name}</h3>
          {card.card_network && <span className={styles.typeBadge}>{card.card_network}</span>}
          {card.card_number_last4 && <span className={styles.last4}>•••• {card.card_number_last4}</span>}
          {summary.is_overdue && <span className={styles.overdueBadge}>Overdue</span>}
        </div>
        <div className={styles.accountCardActions}>
          <button className={styles.iconBtn} onClick={() => onEdit(card)} title="Edit card">
            <svg viewBox="0 0 20 20" fill="none" width={16} height={16}>
              <path
                d="M14.5 3.5l2 2L6 16l-2.5.5.5-2.5L14.5 3.5z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button className={styles.iconBtnDanger} onClick={() => onDelete(card.id)} title="Delete card">
            <svg viewBox="0 0 20 20" fill="none" width={16} height={16}>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {card.bank_name && <p className={styles.bankName}>{card.bank_name}</p>}

      <div className={styles.balanceRow}>
        <div className={styles.balanceBlock}>
          <span className={styles.metricLabel}>Outstanding</span>
          <span className={balance > 0 ? `${styles.balanceBig} ${styles.balanceNeg}` : styles.balanceBig}>
            {fmtCurrency(balance)}
          </span>
          {card.credit_limit > 0 && (
            <div className={styles.utilTrack}>
              <div
                className={styles.utilFill}
                style={{ width: `${Math.min(100, utilization_pct)}%`, background: utilColor }}
              />
            </div>
          )}
        </div>
        <div className={styles.statsBlock}>
          <div className={styles.statItem}>
            <span className={styles.metricLabel}>Total Spend</span>
            <span className={styles.statValueNeg}>{fmtCurrency(total_spend)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.metricLabel}>Total Paid</span>
            <span className={styles.statValuePos}>{fmtCurrency(total_payments)}</span>
          </div>
        </div>
      </div>

      {card.credit_limit > 0 && (
        <div className={styles.statementRow}>
          <div className={styles.statementItem}>
            <span className={styles.metricLabel}>Credit Limit</span>
            <span className={styles.statementValue}>{fmtCurrency(card.credit_limit)}</span>
          </div>
          <div className={styles.statementItem}>
            <span className={styles.metricLabel}>Available</span>
            <span className={styles.statementValue}>{fmtCurrency(available_credit)}</span>
          </div>
          <div className={styles.statementItem}>
            <span className={styles.metricLabel}>Utilization</span>
            <span className={styles.statementValue}>{utilization_pct.toFixed(0)}%</span>
          </div>
        </div>
      )}

      {(card.current_statement_balance != null || card.current_minimum_due != null) && (
        <div className={styles.statementRow}>
          {card.current_statement_balance != null && (
            <div className={styles.statementItem}>
              <span className={styles.metricLabel}>Statement Balance</span>
              <span className={styles.statementValue}>{fmtCurrency(card.current_statement_balance)}</span>
            </div>
          )}
          {card.current_minimum_due != null && (
            <div className={styles.statementItem}>
              <span className={styles.metricLabel}>Minimum Due</span>
              <span className={styles.statementValue}>{fmtCurrency(card.current_minimum_due)}</span>
            </div>
          )}
        </div>
      )}

      <div className={summary.is_overdue ? `${styles.dueRow} ${styles.dueRowOverdue}` : styles.dueRow}>
        <div>
          <div className={styles.dueLabel}>Next Due Date</div>
          <div className={styles.dueDate}>{fmtDate(summary.next_due_date)}</div>
        </div>
        <span className={summary.is_overdue ? styles.dueCountdownOverdue : styles.dueCountdown}>
          {summary.is_overdue
            ? `${Math.abs(summary.days_until_due)} day${Math.abs(summary.days_until_due) === 1 ? '' : 's'} overdue`
            : summary.days_until_due === 0
            ? 'Due today'
            : `Due in ${summary.days_until_due} day${summary.days_until_due === 1 ? '' : 's'}`}
        </span>
      </div>

      <div className={styles.accountCardFooter}>
        <button className={styles.addTxnBtn} onClick={() => onAddTransaction(card.id)}>
          + Add Transaction
        </button>
        <button className={styles.toggleLedger} onClick={onToggleExpand}>
          {expanded ? 'Hide' : 'Show'} transactions ({transactions.length})
        </button>
      </div>

      {expanded && (
        <div className={styles.ledger}>
          {recentFirst.length === 0 ? (
            <p className={styles.emptyLedger}>No transactions yet.</p>
          ) : (
            recentFirst.map((t) => (
              <div key={t.id} className={styles.ledgerRow}>
                <div className={styles.ledgerMain}>
                  <span className={styles.ledgerDate}>{fmtDate(t.date)}</span>
                  <span className={styles.ledgerDesc}>
                    {t.description ||
                      (t.type === 'spend' ? 'Spend' : t.type === 'payment' ? 'Payment' : 'Refund')}
                    {t.category && <span className={styles.categoryBadge}>{t.category}</span>}
                    {t.expense_entry_id && <span className={styles.categoryBadge}>via Expenses</span>}
                    {t.bank_account_name && (
                      <span className={styles.categoryBadge}>from {t.bank_account_name}</span>
                    )}
                  </span>
                </div>
                <div className={styles.ledgerRight}>
                  <span className={t.type === 'spend' ? styles.ledgerAmountNeg : styles.ledgerAmountPos}>
                    {t.type === 'spend' ? '+' : '−'}
                    {fmtCurrency(t.amount)}
                  </span>
                  <span className={styles.ledgerRunning}>Owed {fmtCurrency(t.running_balance)}</span>
                  <div className={styles.ledgerActions}>
                    {!t.expense_entry_id && !t.bank_transaction_id && (
                      <button
                        className={styles.iconBtnSmall}
                        onClick={() => onEditTransaction(t)}
                        title="Edit transaction"
                      >
                        <svg viewBox="0 0 20 20" fill="none" width={13} height={13}>
                          <path
                            d="M14.5 3.5l2 2L6 16l-2.5.5.5-2.5L14.5 3.5z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}
                    <button
                      className={styles.iconBtnSmallDanger}
                      onClick={() => onDeleteTransaction(t.id)}
                      title={
                        t.expense_entry_id
                          ? 'Delete (removes the linked Expenses entry too)'
                          : t.bank_transaction_id
                          ? 'Delete (removes the linked bank transaction too)'
                          : 'Delete transaction'
                      }
                    >
                      <svg viewBox="0 0 20 20" fill="none" width={13} height={13}>
                        <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function CreditCardTracker({ displayName }: Props) {
  const [portfolio, setPortfolio] = useState<CreditCardPortfolioSummary>({
    cards: [],
    total_balance: 0,
    total_credit_limit: 0,
    total_available_credit: 0,
  });
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCardModal, setShowCardModal] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);

  const [showTxnModal, setShowTxnModal] = useState(false);
  const [txnDefaultCardId, setTxnDefaultCardId] = useState<string | null>(null);

  const [editingTxn, setEditingTxn] = useState<CreditCardLedgerEntry | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchPortfolio = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/credit-cards');
      if (!res.ok) throw new Error('Failed to load cards');
      const data = await res.json();
      setPortfolio(
        data.portfolio ?? { cards: [], total_balance: 0, total_credit_limit: 0, total_available_credit: 0 }
      );
    } catch {
      setError('Failed to load credit cards. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Expense heads and bank accounts for the transaction modal's optional
  // linkage pickers — loaded once, independent of the card portfolio
  // refresh cycle, since neither list changes when a card transaction is
  // added.
  const loadLinkOptions = useCallback(async () => {
    try {
      const [expenseRes, bankRes] = await Promise.all([
        fetch(`/api/expense-entries?month=${new Date().toISOString().slice(0, 7)}`),
        fetch('/api/bank-accounts'),
      ]);
      if (expenseRes.ok) {
        const data = await expenseRes.json();
        setExpenseCategories(data.categories ?? []);
      }
      if (bankRes.ok) {
        const data = await bankRes.json();
        const accounts = (data.portfolio?.accounts ?? []) as { account: { id: string; name: string } }[];
        setBankAccounts(accounts.map((a) => ({ id: a.account.id, name: a.account.name })));
      }
    } catch {
      // Non-fatal — the linkage pickers just stay empty (transactions can
      // still be saved unlinked) if this fails.
    }
  }, []);

  useEffect(() => {
    fetchPortfolio();
    loadLinkOptions();
  }, [fetchPortfolio, loadLinkOptions]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteCard = async (id: string) => {
    if (!confirm('Delete this card and all of its transactions? This cannot be undone.')) return;
    const res = await fetch(`/api/credit-cards/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchPortfolio();
    } else {
      alert('Failed to delete card.');
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!confirm('Delete this transaction? This cannot be undone.')) return;
    const res = await fetch(`/api/credit-card-transactions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchPortfolio();
    } else {
      alert('Failed to delete transaction.');
    }
  };

  return (
    <AppShell active="credit-cards" displayName={displayName}>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <span className={styles.eyebrow}>Finance</span>
          <h2 className={styles.pageTitle}>Credit Cards</h2>
        </div>

        <main className={styles.main}>
          {error && <div className={styles.errorBanner}>{error}</div>}

          {loading ? (
            <p className={styles.loadingText}>Loading…</p>
          ) : (
            <>
              {portfolio.cards.length > 0 && (
                <div className={styles.summaryCard}>
                  <div className={styles.summaryHeading}>Portfolio Overview</div>
                  <div className={styles.summaryRow}>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Total Outstanding</span>
                      <span className={styles.summaryBig} style={{ color: 'var(--brick)' }}>
                        {fmtCurrency(portfolio.total_balance)}
                      </span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Total Credit Limit</span>
                      <span className={styles.summaryBig}>{fmtCurrency(portfolio.total_credit_limit)}</span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Available Credit</span>
                      <span className={styles.summaryBig}>{fmtCurrency(portfolio.total_available_credit)}</span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Cards</span>
                      <span className={styles.summaryBig}>{portfolio.cards.length}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className={styles.toolbar}>
                <button
                  className={styles.addBtnSecondary}
                  onClick={() => {
                    setTxnDefaultCardId(portfolio.cards[0]?.card.id ?? null);
                    setShowTxnModal(true);
                  }}
                  disabled={portfolio.cards.length === 0}
                >
                  + Add Transaction
                </button>
                <button
                  className={styles.addBtn}
                  onClick={() => {
                    setEditingCard(null);
                    setShowCardModal(true);
                  }}
                >
                  + Add Card
                </button>
              </div>

              {portfolio.cards.length === 0 ? (
                <div className={styles.emptyState}>
                  <h3 className={styles.emptyTitle}>No credit cards yet</h3>
                  <p className={styles.emptyHint}>
                    Add a card to start tracking what you owe, your due dates, and your spending.
                  </p>
                </div>
              ) : (
                <div className={styles.accountList}>
                  {portfolio.cards.map((summary) => (
                    <CardCard
                      key={summary.card.id}
                      summary={summary}
                      expanded={expandedIds.has(summary.card.id)}
                      onToggleExpand={() => toggleExpand(summary.card.id)}
                      onEdit={(card) => {
                        setEditingCard(card);
                        setShowCardModal(true);
                      }}
                      onDelete={handleDeleteCard}
                      onAddTransaction={(cardId) => {
                        setTxnDefaultCardId(cardId);
                        setShowTxnModal(true);
                      }}
                      onEditTransaction={setEditingTxn}
                      onDeleteTransaction={handleDeleteTransaction}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {showCardModal && (
        <AddCreditCardModal
          existing={editingCard}
          onClose={() => setShowCardModal(false)}
          onSaved={() => {
            setShowCardModal(false);
            fetchPortfolio();
          }}
        />
      )}

      {showTxnModal && (
        <CreditCardTransactionModal
          cards={portfolio.cards}
          expenseCategories={expenseCategories}
          bankAccounts={bankAccounts}
          defaultCardId={txnDefaultCardId}
          onClose={() => setShowTxnModal(false)}
          onSaved={() => {
            setShowTxnModal(false);
            fetchPortfolio();
          }}
        />
      )}

      {editingTxn && (
        <EditCardTransactionModal
          transaction={editingTxn}
          onClose={() => setEditingTxn(null)}
          onSaved={() => {
            setEditingTxn(null);
            fetchPortfolio();
          }}
        />
      )}
    </AppShell>
  );
}
