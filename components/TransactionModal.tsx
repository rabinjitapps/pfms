'use client';

import { useState, useEffect, useRef } from 'react';
import { HoldingSummary } from '@/types';

interface Props {
  holding: HoldingSummary;
  onClose: () => void;
  onSaved: () => void;
}

type EntryMode = 'amount' | 'units';

export default function TransactionModal({ holding, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<'transaction' | 'nav' | 'history' | 'bulk'>('transaction');

  const [type, setType] = useState<'BUY' | 'SELL'>('BUY');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [entryMode, setEntryMode] = useState<EntryMode>('amount');
  const [amount, setAmount] = useState('');
  const [units, setUnits] = useState('');
  const [nav, setNav] = useState('');
  const [navAutoFetched, setNavAutoFetched] = useState(false);
  const [navFetching, setNavFetching] = useState(false);
  const [navFetchNote, setNavFetchNote] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [navValue, setNavValue] = useState(holding.fund.latest_nav?.toString() ?? '');
  const [navDate, setNavDate] = useState(new Date().toISOString().slice(0, 10));

  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const [bulkFileName, setBulkFileName] = useState('');
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkResult, setBulkResult] = useState<{
    imported: number;
    skipped: number;
    errors: { row: number; message: string }[];
  } | null>(null);

  const hasSchemeCode = Boolean(holding.fund.scheme_code);
  const lastFetchedKey = useRef<string>('');

  // Auto-fetch NAV from mfapi.in whenever the date changes (AMFI-linked funds only).
  useEffect(() => {
    if (tab !== 'transaction' || !hasSchemeCode || !date) return;

    const key = `${holding.fund.scheme_code}:${date}`;
    if (lastFetchedKey.current === key) return;
    lastFetchedKey.current = key;

    let cancelled = false;
    setNavFetching(true);
    setNavFetchNote('');

    (async () => {
      try {
        const res = await fetch(
          `/api/funds/nav-on-date?schemeCode=${holding.fund.scheme_code}&date=${date}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setNavFetchNote(data.error || 'Could not fetch NAV for this date.');
          setNavAutoFetched(false);
          return;
        }
        setNav(data.nav.toString());
        setNavAutoFetched(true);
        if (data.date !== date) {
          setNavFetchNote(`Market closed on ${date}; using NAV from ${data.date}.`);
        } else {
          setNavFetchNote('');
        }
      } catch {
        if (!cancelled) setNavFetchNote('Could not reach NAV lookup. Enter NAV manually.');
      } finally {
        if (!cancelled) setNavFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [date, tab, hasSchemeCode, holding.fund.scheme_code]);

  const navNum = Number(nav) || 0;
  const computedUnits = entryMode === 'amount' && navNum > 0 && amount ? Number(amount) / navNum : null;
  const computedAmount = entryMode === 'units' && navNum > 0 && units ? Number(units) * navNum : null;

  const finalUnits = entryMode === 'amount' ? computedUnits : Number(units) || 0;
  const finalAmount = entryMode === 'units' ? computedAmount : Number(amount) || 0;

  async function handleAddTransaction() {
    setError('');
    if (!nav || navNum <= 0) {
      setError('NAV is required.');
      return;
    }
    if (!finalUnits || finalUnits <= 0) {
      setError(entryMode === 'amount' ? 'Enter an amount.' : 'Enter units.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdingId: holding.id,
          type,
          date,
          units: finalUnits,
          nav: navNum,
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
      setUnits('');
      setNotes('');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateNav() {
    setError('');
    if (!navValue) {
      setError('NAV is required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/funds/update-nav', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundId: holding.fund.id, nav: Number(navValue), date: navDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not update NAV.');
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
    const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not delete transaction.');
      return;
    }
    onSaved();
  }

  function handleBulkFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setBulkError('');
    setBulkResult(null);
    const file = e.target.files?.[0];
    setBulkFileName(file ? file.name : '');
  }

  async function handleBulkUpload() {
    const file = bulkFileInputRef.current?.files?.[0];
    if (!file) {
      setBulkError('Choose a filled-in template file first.');
      return;
    }

    setBulkError('');
    setBulkUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/holdings/${holding.id}/bulk`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setBulkError(data.error || 'Could not import this file.');
        return;
      }

      setBulkResult(data);
      if (data.imported > 0) {
        onSaved();
      }
    } catch {
      setBulkError('Could not reach the server.');
    } finally {
      setBulkUploading(false);
    }
  }

  const sortedTxns = [...holding.transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Mirrors the server's delete guard so the UI can tell you up front which
  // transactions are actually deletable right now, instead of you finding
  // out by trial and error. A delete is allowed if it doesn't push units
  // negative, or — when units are already negative from a data mistake —
  // if it's a genuine step toward fixing that (not toward making it worse).
  const EPSILON = 0.0001;
  const currentUnits = holding.transactions.reduce(
    (sum, t) => sum + (t.type === 'BUY' ? Number(t.units) : -Number(t.units)),
    0
  );
  const wasAlreadyNegative = currentUnits < -EPSILON;

  function canDelete(txnId: string): boolean {
    const remaining = holding.transactions.filter((t) => t.id !== txnId);
    const resultingUnits = remaining.reduce(
      (sum, t) => sum + (t.type === 'BUY' ? Number(t.units) : -Number(t.units)),
      0
    );
    if (resultingUnits >= -EPSILON) return true;
    if (!wasAlreadyNegative) return false;
    return resultingUnits > currentUnits + EPSILON;
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>{holding.fund.name}</h2>
            {holding.fund.scheme_code && (
              <p style={styles.subtitle}>AMFI code {holding.fund.scheme_code}</p>
            )}
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
            style={tab === 'nav' ? styles.tabActive : styles.tab}
            onClick={() => setTab('nav')}
          >
            Update NAV
          </button>
          <button
            style={tab === 'history' ? styles.tabActive : styles.tab}
            onClick={() => setTab('history')}
          >
            History ({holding.transactions.length})
          </button>
          <button
            style={tab === 'bulk' ? styles.tabActive : styles.tab}
            onClick={() => setTab('bulk')}
          >
            Bulk import
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
                NAV (₹){navFetching && <span style={styles.navStatus}> · fetching…</span>}
                {!navFetching && navAutoFetched && (
                  <span style={styles.navStatusOk}> · auto-filled</span>
                )}
                <input
                  style={styles.input}
                  type="number"
                  step="0.0001"
                  value={nav}
                  onChange={(e) => {
                    setNav(e.target.value);
                    setNavAutoFetched(false);
                  }}
                  placeholder={hasSchemeCode ? 'Auto-filled from date' : '0.00'}
                />
              </label>
            </div>

            {navFetchNote && <p style={styles.navNote}>{navFetchNote}</p>}
            {!hasSchemeCode && (
              <p style={styles.navNote}>
                This fund has no AMFI code, so NAV can&apos;t be auto-fetched — enter it manually.
              </p>
            )}

            <div style={styles.entryToggle}>
              <button
                style={entryMode === 'amount' ? styles.entryBtnActive : styles.entryBtn}
                onClick={() => setEntryMode('amount')}
              >
                Enter amount
              </button>
              <button
                style={entryMode === 'units' ? styles.entryBtnActive : styles.entryBtn}
                onClick={() => setEntryMode('units')}
              >
                Enter units
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
                  Units
                  <input
                    style={styles.input}
                    type="number"
                    step="0.0001"
                    value={units}
                    onChange={(e) => setUnits(e.target.value)}
                    placeholder="0.000"
                  />
                </label>
              </div>
            )}

            {entryMode === 'amount' && computedUnits !== null && (
              <p style={styles.computedAmount}>
                ≈ {computedUnits.toLocaleString('en-IN', { maximumFractionDigits: 4 })} units
              </p>
            )}
            {entryMode === 'units' && computedAmount !== null && (
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
                placeholder="e.g. SIP installment"
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

        {tab === 'nav' && (
          <div>
            <p style={styles.hint}>
              Manually set the latest NAV for this fund. This overrides the AMFI auto-fetch value
              until the next refresh.
            </p>
            <div style={styles.row}>
              <label style={styles.label}>
                NAV (₹)
                <input
                  style={styles.input}
                  type="number"
                  step="0.0001"
                  value={navValue}
                  onChange={(e) => setNavValue(e.target.value)}
                />
              </label>
              <label style={styles.label}>
                As of date
                <input
                  style={styles.input}
                  type="date"
                  value={navDate}
                  onChange={(e) => setNavDate(e.target.value)}
                />
              </label>
            </div>

            {error && <p style={styles.error}>{error}</p>}

            <div style={styles.actions}>
              <button style={styles.cancelBtn} onClick={onClose}>Close</button>
              <button style={styles.submitBtn} disabled={saving} onClick={handleUpdateNav}>
                {saving ? 'Saving…' : 'Update NAV'}
              </button>
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div>
            {error && <p style={styles.error}>{error}</p>}
            {wasAlreadyNegative && (
              <p style={styles.negativeBanner}>
                ⚠ This fund&apos;s units have gone negative ({currentUnits.toFixed(4)}) — one or
                more SELL transactions exceed what was actually bought. Delete the extra SELL
                transactions below (marked &ldquo;safe to delete&rdquo;) until the units are zero
                or positive again.
              </p>
            )}
            {sortedTxns.length === 0 ? (
              <p style={styles.hint}>No transactions recorded yet.</p>
            ) : (
              <div style={styles.historyList}>
                {sortedTxns.map((t) => {
                  const deletable = canDelete(t.id);
                  const latestNav = holding.fund.latest_nav;
                  // Current value of this specific lump (what it would be
                  // worth today, at the fund's latest NAV) — BUY only, since
                  // a SELL has already been converted to cash and has no
                  // "current value" of its own.
                  const showCurrentValue = t.type === 'BUY' && latestNav != null && latestNav > 0;
                  const currentValue = showCurrentValue ? Number(t.units) * latestNav : 0;
                  const txnGainLoss = showCurrentValue ? currentValue - Number(t.amount) : 0;
                  const txnGainLossPct =
                    showCurrentValue && Number(t.amount) > 0
                      ? (txnGainLoss / Number(t.amount)) * 100
                      : 0;
                  return (
                    <div key={t.id} style={styles.historyRow}>
                      <div>
                        <span style={t.type === 'BUY' ? styles.tagBuy : styles.tagSell}>
                          {t.type}
                        </span>
                        <span style={styles.historyDate}>{t.date}</span>
                      </div>
                      <div style={styles.historyDetail}>
                        {Number(t.units).toLocaleString('en-IN', { maximumFractionDigits: 4 })} units
                        {' @ '}₹{Number(t.nav).toFixed(2)}
                        {' = '}₹{Number(t.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </div>
                      {showCurrentValue && (
                        <div style={styles.historyCurrentValue}>
                          Now worth ₹
                          {currentValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          {' '}
                          <span style={txnGainLoss >= 0 ? styles.gainText : styles.lossText}>
                            ({txnGainLoss >= 0 ? '+' : ''}
                            {txnGainLoss.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            {' · '}
                            {txnGainLoss >= 0 ? '+' : ''}
                            {txnGainLossPct.toFixed(2)}%)
                          </span>
                        </div>
                      )}
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

        {tab === 'bulk' && (
          <div>
            <p style={styles.hint}>
              Add many BUY/SELL transactions for this fund in one go. Download the template
              below, fill it in, then upload it here.
            </p>

            <a
              href={`/api/holdings/${holding.id}/bulk/template`}
              download
              style={styles.templateLink}
            >
              ⬇ Download Excel template
            </a>

            <label style={styles.dropZone}>
              <input
                ref={bulkFileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleBulkFileChange}
                style={styles.fileInput}
              />
              {bulkFileName ? (
                <span style={styles.fileName}>{bulkFileName}</span>
              ) : (
                <span style={styles.dropHint}>Click to choose a filled-in .xlsx file</span>
              )}
            </label>

            {bulkError && <p style={styles.error}>{bulkError}</p>}

            {bulkResult && (
              <div style={styles.resultBox}>
                <p style={styles.resultSummary}>
                  Imported {bulkResult.imported} transaction{bulkResult.imported === 1 ? '' : 's'}
                  {bulkResult.skipped > 0
                    ? `, skipped ${bulkResult.skipped} row${bulkResult.skipped === 1 ? '' : 's'}`
                    : ''}
                  .
                </p>
                {bulkResult.errors.length > 0 && (
                  <div style={styles.errorList}>
                    {bulkResult.errors.map((e, i) => (
                      <p key={i} style={styles.errorRow}>
                        Row {e.row}: {e.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={styles.actions}>
              <button style={styles.cancelBtn} onClick={onClose}>
                {bulkResult ? 'Done' : 'Cancel'}
              </button>
              {!bulkResult && (
                <button
                  style={styles.submitBtn}
                  disabled={bulkUploading || !bulkFileName}
                  onClick={handleBulkUpload}
                >
                  {bulkUploading ? 'Importing…' : 'Import'}
                </button>
              )}
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
  navStatus: {
    color: 'var(--ink-faint)',
    fontWeight: 400,
    fontSize: '12px',
  },
  navStatusOk: {
    color: 'var(--ledger-green)',
    fontWeight: 500,
    fontSize: '12px',
  },
  navNote: {
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
  historyCurrentValue: {
    fontSize: '12.5px',
    color: 'var(--ink-soft)',
    fontFamily: 'var(--font-mono)',
    marginTop: '4px',
  },
  gainText: {
    color: 'var(--ledger-green)',
    fontWeight: 600,
  },
  lossText: {
    color: 'var(--brick)',
    fontWeight: 600,
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
  templateLink: {
    display: 'inline-block',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--ledger-green)',
    border: '1px solid var(--ledger-green)',
    borderRadius: '3px',
    padding: '9px 14px',
    marginBottom: '18px',
  },
  dropZone: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '64px',
    border: '1px dashed var(--hairline)',
    borderRadius: '4px',
    background: 'var(--paper)',
    cursor: 'pointer',
    marginBottom: '14px',
    padding: '12px',
    textAlign: 'center',
  },
  fileInput: {
    position: 'absolute',
    inset: 0,
    opacity: 0,
    cursor: 'pointer',
  },
  fileName: {
    fontSize: '14px',
    color: 'var(--ink)',
    fontWeight: 500,
  },
  dropHint: {
    fontSize: '13px',
    color: 'var(--ink-faint)',
  },
  resultBox: {
    border: '1px solid var(--hairline)',
    borderRadius: '4px',
    padding: '14px',
    marginBottom: '4px',
    background: 'var(--paper)',
  },
  resultSummary: {
    fontSize: '14px',
    color: 'var(--ink)',
    fontWeight: 600,
    margin: '0 0 6px',
  },
  errorList: {
    maxHeight: '160px',
    overflowY: 'auto',
    marginTop: '8px',
    borderTop: '1px solid var(--hairline)',
    paddingTop: '8px',
  },
  errorRow: {
    fontSize: '12.5px',
    color: 'var(--brick)',
    margin: '0 0 4px',
  },
};