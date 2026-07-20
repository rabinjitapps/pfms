'use client';

import { useState, useEffect, useRef } from 'react';
import { CryptoHoldingSummary } from '@/types';

interface Props {
  holding: CryptoHoldingSummary;
  onClose: () => void;
  onSaved: () => void;
}

type EntryMode = 'amount' | 'quantity';

export default function CryptoTransactionModal({ holding, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<'transaction' | 'price' | 'history'>('transaction');

  const [type, setType] = useState<'BUY' | 'SELL'>('BUY');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [entryMode, setEntryMode] = useState<EntryMode>('amount');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [priceAutoFetched, setPriceAutoFetched] = useState(false);
  const [priceFetching, setPriceFetching] = useState(false);
  const [priceFetchNote, setPriceFetchNote] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [priceValue, setPriceValue] = useState(holding.crypto.latest_price?.toString() ?? '');
  const [priceDate, setPriceDate] = useState(new Date().toISOString().slice(0, 10));

  const lastFetchedKey = useRef<string>('');

  // Auto-fetch price from Yahoo Finance whenever the date changes.
  useEffect(() => {
    if (tab !== 'transaction' || !date) return;

    const key = `${holding.crypto.symbol}:${date}`;
    if (lastFetchedKey.current === key) return;
    lastFetchedKey.current = key;

    let cancelled = false;
    setPriceFetching(true);
    setPriceFetchNote('');

    (async () => {
      try {
        const res = await fetch(
          `/api/cryptos/price-on-date?symbol=${encodeURIComponent(holding.crypto.symbol)}&date=${date}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setPriceFetchNote(data.error || 'Could not fetch price for this date.');
          setPriceAutoFetched(false);
          return;
        }
        setPrice(data.price.toString());
        setPriceAutoFetched(true);
        if (data.date !== date) {
          setPriceFetchNote(`No data for ${date}; using price from ${data.date}.`);
        } else {
          setPriceFetchNote('');
        }
      } catch {
        if (!cancelled) setPriceFetchNote('Could not reach price lookup. Enter price manually.');
      } finally {
        if (!cancelled) setPriceFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [date, tab, holding.crypto.symbol]);

  const priceNum = Number(price) || 0;
  const computedQuantity = entryMode === 'amount' && priceNum > 0 && amount ? Number(amount) / priceNum : null;
  const computedAmount = entryMode === 'quantity' && priceNum > 0 && quantity ? Number(quantity) * priceNum : null;

  const finalQuantity = entryMode === 'amount' ? computedQuantity : Number(quantity) || 0;
  const finalAmount = entryMode === 'quantity' ? computedAmount : Number(amount) || 0;

  async function handleAddTransaction() {
    setError('');
    if (!price || priceNum <= 0) {
      setError('Price is required.');
      return;
    }
    if (!finalQuantity || finalQuantity <= 0) {
      setError(entryMode === 'amount' ? 'Enter an amount.' : 'Enter quantity.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/crypto-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdingId: holding.id,
          type,
          date,
          quantity: finalQuantity,
          price: priceNum,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save transaction.');
        return;
      }
      onSaved();
      setAmount('');
      setQuantity('');
      setNotes('');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdatePrice() {
    setError('');
    if (!priceValue) {
      setError('Price is required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/cryptos/update-price', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cryptoId: holding.crypto.id, price: Number(priceValue), date: priceDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not update price.');
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTransaction(id: string) {
    if (!confirm('Delete this transaction? This cannot be undone.')) return;
    setError('');
    const res = await fetch(`/api/crypto-transactions/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not delete transaction.');
      return;
    }
    onSaved();
  }

  const sortedTxns = [...holding.transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Mirrors the server's delete guard so the UI can tell you up front which
  // transactions are actually deletable right now, instead of you finding
  // out by trial and error. A delete is allowed if it doesn't push quantity
  // negative, or — when quantity is already negative from a data mistake —
  // if it's a genuine step toward fixing that (not toward making it worse).
  const EPSILON = 0.00000001;
  const currentQuantity = holding.transactions.reduce(
    (sum, t) => sum + (t.type === 'BUY' ? Number(t.quantity) : -Number(t.quantity)),
    0
  );
  const wasAlreadyNegative = currentQuantity < -EPSILON;

  function canDelete(txnId: string): boolean {
    const remaining = holding.transactions.filter((t) => t.id !== txnId);
    const resultingQuantity = remaining.reduce(
      (sum, t) => sum + (t.type === 'BUY' ? Number(t.quantity) : -Number(t.quantity)),
      0
    );
    if (resultingQuantity >= -EPSILON) return true;
    if (!wasAlreadyNegative) return false;
    return resultingQuantity > currentQuantity + EPSILON;
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>{holding.crypto.name}</h2>
            <p style={styles.subtitle}>{holding.crypto.symbol}</p>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div style={styles.tabs}>
          <button
            style={tab === 'transaction' ? styles.tabActive : styles.tab}
            onClick={() => setTab('transaction')}
          >
            Record transaction
          </button>
          <button
            style={tab === 'price' ? styles.tabActive : styles.tab}
            onClick={() => setTab('price')}
          >
            Update price
          </button>
          <button
            style={tab === 'history' ? styles.tabActive : styles.tab}
            onClick={() => setTab('history')}
          >
            History ({holding.transactions.length})
          </button>
        </div>

        {tab === 'transaction' && (
          <div>
            <div style={styles.typeToggle}>
              <button
                style={type === 'BUY' ? styles.typeBtnActiveBuy : styles.typeBtn}
                onClick={() => setType('BUY')}
              >
                Buy
              </button>
              <button
                style={type === 'SELL' ? styles.typeBtnActiveSell : styles.typeBtn}
                onClick={() => setType('SELL')}
              >
                Sell
              </button>
            </div>

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
                Price (₹){priceFetching && <span style={styles.priceStatus}> · fetching…</span>}
                {!priceFetching && priceAutoFetched && (
                  <span style={styles.priceStatusOk}> · auto-filled</span>
                )}
                <input
                  style={styles.input}
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => {
                    setPrice(e.target.value);
                    setPriceAutoFetched(false);
                  }}
                  placeholder="Auto-filled from date"
                />
              </label>
            </div>

            {priceFetchNote && <p style={styles.priceNote}>{priceFetchNote}</p>}

            <div style={styles.entryToggle}>
              <button
                style={entryMode === 'amount' ? styles.entryBtnActive : styles.entryBtn}
                onClick={() => setEntryMode('amount')}
              >
                Enter amount
              </button>
              <button
                style={entryMode === 'quantity' ? styles.entryBtnActive : styles.entryBtn}
                onClick={() => setEntryMode('quantity')}
              >
                Enter quantity
              </button>
            </div>

            {entryMode === 'amount' ? (
              <div style={styles.row}>
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
            ) : (
              <div style={styles.row}>
                <label style={styles.label}>
                  Quantity
                  <input
                    style={styles.input}
                    type="number"
                    step="0.00000001"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="0"
                  />
                </label>
              </div>
            )}

            {entryMode === 'amount' && computedQuantity !== null && (
              <p style={styles.computedAmount}>
                ≈ {computedQuantity.toLocaleString('en-IN', { maximumFractionDigits: 8 })} {holding.crypto.symbol.split('-')[0]}
              </p>
            )}
            {entryMode === 'quantity' && computedAmount !== null && (
              <p style={styles.computedAmount}>
                ≈ ₹{computedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </p>
            )}

            <label style={styles.label}>
              Notes <span style={styles.optional}>(optional)</span>
              <input
                style={styles.input}
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. DCA top-up"
              />
            </label>

            {error && <p style={styles.error}>{error}</p>}

            <div style={styles.actions}>
              <button style={styles.cancelBtn} onClick={onClose}>Close</button>
              <button style={styles.submitBtn} disabled={saving} onClick={handleAddTransaction}>
                {saving ? 'Saving…' : `Record ${type === 'BUY' ? 'buy' : 'sell'}`}
              </button>
            </div>
          </div>
        )}

        {tab === 'price' && (
          <div>
            <p style={styles.hint}>
              Manually set the latest price for this coin. This overrides the auto-fetched value
              until the next refresh.
            </p>
            <div style={styles.row}>
              <label style={styles.label}>
                Price (₹)
                <input
                  style={styles.input}
                  type="number"
                  step="0.01"
                  value={priceValue}
                  onChange={(e) => setPriceValue(e.target.value)}
                />
              </label>
              <label style={styles.label}>
                As of date
                <input
                  style={styles.input}
                  type="date"
                  value={priceDate}
                  onChange={(e) => setPriceDate(e.target.value)}
                />
              </label>
            </div>

            {error && <p style={styles.error}>{error}</p>}

            <div style={styles.actions}>
              <button style={styles.cancelBtn} onClick={onClose}>Close</button>
              <button style={styles.submitBtn} disabled={saving} onClick={handleUpdatePrice}>
                {saving ? 'Saving…' : 'Update price'}
              </button>
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div>
            {error && <p style={styles.error}>{error}</p>}
            {wasAlreadyNegative && (
              <p style={styles.negativeBanner}>
                ⚠ This coin&apos;s quantity has gone negative ({currentQuantity.toFixed(8)}) — one
                or more SELL transactions exceed what was actually bought. Delete the extra SELL
                transactions below (marked &ldquo;safe to delete&rdquo;) until the quantity is zero
                or positive again.
              </p>
            )}
            {sortedTxns.length === 0 ? (
              <p style={styles.hint}>No transactions recorded yet.</p>
            ) : (
              <div style={styles.historyList}>
                {sortedTxns.map((t) => {
                  const deletable = canDelete(t.id);
                  return (
                    <div key={t.id} style={styles.historyRow}>
                      <div>
                        <span style={t.type === 'BUY' ? styles.tagBuy : styles.tagSell}>
                          {t.type}
                        </span>
                        <span style={styles.historyDate}>{t.date}</span>
                      </div>
                      <div style={styles.historyDetail}>
                        {Number(t.quantity).toLocaleString('en-IN', { maximumFractionDigits: 8 })}
                        {' @ '}₹{Number(t.price).toFixed(2)}
                        {' = '}₹{Number(t.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </div>
                      {t.notes && <div style={styles.historyNotes}>{t.notes}</div>}
                      {wasAlreadyNegative && (
                        <div style={deletable ? styles.deletableHint : styles.notDeletableHint}>
                          {deletable ? '✓ safe to delete' : '✗ would not help — try a different one'}
                        </div>
                      )}
                      <button style={styles.deleteBtn} onClick={() => handleDeleteTransaction(t.id)}>
                        Delete
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={styles.actions}>
              <button style={styles.cancelBtn} onClick={onClose}>Close</button>
            </div>
          </div>
        )}
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
    maxWidth: '520px',
    maxHeight: '88vh',
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
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '20px',
    fontWeight: 600,
    color: 'var(--ink)',
    margin: 0,
  },
  subtitle: {
    fontSize: '12px',
    color: 'var(--ink-faint)',
    fontFamily: 'var(--font-mono)',
    margin: '4px 0 0',
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
    marginBottom: '20px',
    borderBottom: '1px solid var(--hairline)',
    flexWrap: 'wrap',
  },
  tab: {
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '8px 4px 10px',
    fontSize: '13.5px',
    color: 'var(--ink-faint)',
    fontWeight: 500,
  },
  tabActive: {
    background: 'none',
    border: 'none',
    borderBottom: '2px solid var(--ledger-green)',
    padding: '8px 4px 10px',
    fontSize: '13.5px',
    color: 'var(--ink)',
    fontWeight: 600,
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
    fontSize: '14px',
    fontWeight: 600,
  },
  typeBtnActiveBuy: {
    flex: 1,
    padding: '9px',
    border: '1px solid var(--ledger-green)',
    borderRadius: '4px',
    background: 'var(--ledger-green-soft)',
    color: 'var(--ledger-green)',
    fontSize: '14px',
    fontWeight: 600,
  },
  typeBtnActiveSell: {
    flex: 1,
    padding: '9px',
    border: '1px solid var(--brick)',
    borderRadius: '4px',
    background: 'var(--brick-soft)',
    color: 'var(--brick)',
    fontSize: '14px',
    fontWeight: 600,
  },
  row: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
  },
  priceStatus: {
    color: 'var(--ink-faint)',
    fontWeight: 400,
    fontSize: '12px',
  },
  priceStatusOk: {
    color: 'var(--ledger-green)',
    fontWeight: 500,
    fontSize: '12px',
  },
  priceNote: {
    fontSize: '12px',
    color: 'var(--brass)',
    margin: '-10px 0 14px',
  },
  entryToggle: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
  },
  entryBtn: {
    padding: '7px 12px',
    border: '1px solid var(--hairline)',
    borderRadius: '4px',
    background: 'var(--paper)',
    color: 'var(--ink-faint)',
    fontSize: '13px',
    fontWeight: 500,
  },
  entryBtnActive: {
    padding: '7px 12px',
    border: '1px solid var(--brass)',
    borderRadius: '4px',
    background: 'var(--brass-soft)',
    color: 'var(--brass)',
    fontSize: '13px',
    fontWeight: 600,
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
  computedAmount: {
    fontSize: '13px',
    color: 'var(--ink-soft)',
    fontFamily: 'var(--font-mono)',
    marginTop: '-8px',
    marginBottom: '16px',
  },
  hint: {
    fontSize: '13px',
    color: 'var(--ink-faint)',
    lineHeight: 1.5,
    marginBottom: '16px',
  },
  error: {
    fontSize: '13px',
    color: 'var(--brick)',
    margin: '0 0 12px',
  },
  negativeBanner: {
    fontSize: '13px',
    color: 'var(--brick)',
    background: 'var(--brick-soft)',
    border: '1px solid var(--brick)',
    borderRadius: '4px',
    padding: '12px 14px',
    lineHeight: 1.5,
    margin: '0 0 16px',
  },
  deletableHint: {
    fontSize: '11.5px',
    fontWeight: 600,
    color: 'var(--ledger-green)',
    marginTop: '6px',
  },
  notDeletableHint: {
    fontSize: '11.5px',
    fontWeight: 500,
    color: 'var(--ink-faint)',
    marginTop: '6px',
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
  submitBtn: {
    padding: '10px 18px',
    background: 'var(--ledger-green)',
    border: 'none',
    borderRadius: '3px',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--paper-raised)',
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '8px',
  },
  historyRow: {
    border: '1px solid var(--hairline)',
    borderRadius: '4px',
    padding: '12px',
    position: 'relative',
  },
  tagBuy: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--ledger-green)',
    background: 'var(--ledger-green-soft)',
    padding: '2px 7px',
    borderRadius: '3px',
    marginRight: '8px',
    letterSpacing: '0.02em',
  },
  tagSell: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--brick)',
    background: 'var(--brick-soft)',
    padding: '2px 7px',
    borderRadius: '3px',
    marginRight: '8px',
    letterSpacing: '0.02em',
  },
  historyDate: {
    fontSize: '13px',
    color: 'var(--ink-soft)',
  },
  historyDetail: {
    fontSize: '13.5px',
    color: 'var(--ink)',
    fontFamily: 'var(--font-mono)',
    marginTop: '6px',
  },
  historyNotes: {
    fontSize: '12.5px',
    color: 'var(--ink-faint)',
    marginTop: '4px',
    fontStyle: 'italic',
  },
  deleteBtn: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    background: 'none',
    border: 'none',
    fontSize: '12px',
    color: 'var(--ink-faint)',
    textDecoration: 'underline',
  },
};
