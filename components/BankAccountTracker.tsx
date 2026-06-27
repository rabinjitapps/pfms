'use client';

import { useState, useEffect, useCallback } from 'react';
import AppShell from './AppShell';
import AddBankAccountModal from './AddBankAccountModal';
import BankTransactionModal from './BankTransactionModal';
import styles from './BankAccountTracker.module.css';
import modalStyles from './BankModals.module.css';
import { BankAccount, BankAccountSummary, BankLedgerEntry, BankPortfolioSummary } from '@/types';

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

// ── Edit modal for a single plain (non-transfer) transaction ──
// Transfers are edited by delete + re-add (see the API route), so this only
// ever needs date / amount / description / category.
function EditTransactionModal({
  transaction,
  onClose,
  onSaved,
}: {
  transaction: BankLedgerEntry;
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
      const res = await fetch(`/api/bank-transactions/${transaction.id}`, {
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

function AccountCard({
  summary,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
}: {
  summary: BankAccountSummary;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: (account: BankAccount) => void;
  onDelete: (id: string) => void;
  onAddTransaction: (accountId: string) => void;
  onEditTransaction: (t: BankLedgerEntry) => void;
  onDeleteTransaction: (id: string) => void;
}) {
  const { account, balance, total_credits, total_debits, transactions } = summary;
  const recentFirst = [...transactions].reverse();

  return (
    <div className={styles.accountCard}>
      <div className={styles.accountCardHeader}>
        <div className={styles.accountCardTitle}>
          <h3 className={styles.accountName}>{account.name}</h3>
          {account.account_type && <span className={styles.typeBadge}>{account.account_type}</span>}
          {account.account_number_last4 && (
            <span className={styles.last4}>•••• {account.account_number_last4}</span>
          )}
        </div>
        <div className={styles.accountCardActions}>
          <button className={styles.iconBtn} onClick={() => onEdit(account)} title="Edit account">
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
          <button className={styles.iconBtnDanger} onClick={() => onDelete(account.id)} title="Delete account">
            <svg viewBox="0 0 20 20" fill="none" width={16} height={16}>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {account.bank_name && <p className={styles.bankName}>{account.bank_name}</p>}

      <div className={styles.balanceRow}>
        <div className={styles.balanceBlock}>
          <span className={styles.metricLabel}>Current Balance</span>
          <span className={balance < 0 ? `${styles.balanceBig} ${styles.balanceNeg}` : styles.balanceBig}>
            {fmtCurrency(balance)}
          </span>
        </div>
        <div className={styles.statsBlock}>
          <div className={styles.statItem}>
            <span className={styles.metricLabel}>Total In</span>
            <span className={styles.statValuePos}>{fmtCurrency(total_credits)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.metricLabel}>Total Out</span>
            <span className={styles.statValueNeg}>{fmtCurrency(total_debits)}</span>
          </div>
        </div>
      </div>

      <div className={styles.accountCardFooter}>
        <button className={styles.addTxnBtn} onClick={() => onAddTransaction(account.id)}>
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
                    {t.transfer_id
                      ? `Transfer ${t.type === 'debit' ? 'to' : 'from'} ${t.transfer_account_name ?? 'another account'}`
                      : t.description || (t.type === 'credit' ? 'Credit' : 'Debit')}
                    {t.category && <span className={styles.categoryBadge}>{t.category}</span>}
                    {t.expense_entry_id && <span className={styles.categoryBadge}>via Expenses</span>}
                  </span>
                </div>
                <div className={styles.ledgerRight}>
                  <span className={t.type === 'credit' ? styles.ledgerAmountPos : styles.ledgerAmountNeg}>
                    {t.type === 'credit' ? '+' : '−'}
                    {fmtCurrency(t.amount)}
                  </span>
                  <span className={styles.ledgerRunning}>Bal {fmtCurrency(t.running_balance)}</span>
                  <div className={styles.ledgerActions}>
                    {!t.transfer_id && !t.expense_entry_id && (
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
                      title={t.expense_entry_id ? 'Delete (removes the linked Expenses entry too)' : 'Delete transaction'}
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

export default function BankAccountTracker({ displayName }: Props) {
  const [portfolio, setPortfolio] = useState<BankPortfolioSummary>({ accounts: [], total_balance: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);

  const [showTxnModal, setShowTxnModal] = useState(false);
  const [txnDefaultAccountId, setTxnDefaultAccountId] = useState<string | null>(null);

  const [editingTxn, setEditingTxn] = useState<BankLedgerEntry | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchPortfolio = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/bank-accounts');
      if (!res.ok) throw new Error('Failed to load accounts');
      const data = await res.json();
      setPortfolio(data.portfolio ?? { accounts: [], total_balance: 0 });
    } catch {
      setError('Failed to load bank accounts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('Delete this account and all of its transactions? This cannot be undone.')) return;
    const res = await fetch(`/api/bank-accounts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchPortfolio();
    } else {
      alert('Failed to delete account.');
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!confirm('Delete this transaction? This cannot be undone.')) return;
    const res = await fetch(`/api/bank-transactions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchPortfolio();
    } else {
      alert('Failed to delete transaction.');
    }
  };

  return (
    <AppShell active="bank-accounts" displayName={displayName}>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <span className={styles.eyebrow}>Finance</span>
          <h2 className={styles.pageTitle}>Bank Accounts</h2>
        </div>

        <main className={styles.main}>
          {error && <div className={styles.errorBanner}>{error}</div>}

          {loading ? (
            <p className={styles.loadingText}>Loading…</p>
          ) : (
            <>
              {portfolio.accounts.length > 0 && (
                <div className={styles.summaryCard}>
                  <div className={styles.summaryHeading}>Portfolio Overview</div>
                  <div className={styles.summaryRow}>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Total Balance</span>
                      <span className={styles.summaryBig}>{fmtCurrency(portfolio.total_balance)}</span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Accounts</span>
                      <span className={styles.summaryBig}>{portfolio.accounts.length}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className={styles.toolbar}>
                <button
                  className={styles.addBtnSecondary}
                  onClick={() => {
                    setTxnDefaultAccountId(portfolio.accounts[0]?.account.id ?? null);
                    setShowTxnModal(true);
                  }}
                  disabled={portfolio.accounts.length === 0}
                >
                  + Add Transaction
                </button>
                <button
                  className={styles.addBtn}
                  onClick={() => {
                    setEditingAccount(null);
                    setShowAccountModal(true);
                  }}
                >
                  + Add Account
                </button>
              </div>

              {portfolio.accounts.length === 0 ? (
                <div className={styles.emptyState}>
                  <h3 className={styles.emptyTitle}>No bank accounts yet</h3>
                  <p className={styles.emptyHint}>Add an account to start tracking its balance and transactions.</p>
                </div>
              ) : (
                <div className={styles.accountList}>
                  {portfolio.accounts.map((summary) => (
                    <AccountCard
                      key={summary.account.id}
                      summary={summary}
                      expanded={expandedIds.has(summary.account.id)}
                      onToggleExpand={() => toggleExpand(summary.account.id)}
                      onEdit={(account) => {
                        setEditingAccount(account);
                        setShowAccountModal(true);
                      }}
                      onDelete={handleDeleteAccount}
                      onAddTransaction={(accountId) => {
                        setTxnDefaultAccountId(accountId);
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

      {showAccountModal && (
        <AddBankAccountModal
          existing={editingAccount}
          onClose={() => setShowAccountModal(false)}
          onSaved={() => {
            setShowAccountModal(false);
            fetchPortfolio();
          }}
        />
      )}

      {showTxnModal && (
        <BankTransactionModal
          accounts={portfolio.accounts}
          defaultAccountId={txnDefaultAccountId}
          onClose={() => setShowTxnModal(false)}
          onSaved={() => {
            setShowTxnModal(false);
            fetchPortfolio();
          }}
        />
      )}

      {editingTxn && (
        <EditTransactionModal
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
