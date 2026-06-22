'use client';

import { useState, useEffect, useRef } from 'react';

interface StockSearchResult {
  symbol: string;
  shortName: string;
  exchange: string;
}

interface Props {
  onClose: () => void;
  onAdded: () => void;
}

export default function AddStockModal({ onClose, onAdded }: Props) {
  const [mode, setMode] = useState<'search' | 'manual'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selected, setSelected] = useState<StockSearchResult | null>(null);
  const [manualSymbol, setManualSymbol] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mode !== 'search') return;
    if (query.trim().length < 2) {
      setResults([]);
      setSearchError('');
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (!res.ok) {
          setSearchError(data.error || 'Search failed.');
          setResults([]);
        } else {
          setResults(data.results || []);
        }
      } catch {
        setSearchError('Could not reach the search service. Try manual entry instead.');
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, mode]);

  async function handleAddSelected() {
    if (!selected) return;
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/stock-holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selected.symbol,
          name: selected.shortName,
          exchange: selected.exchange,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onAdded();
        onClose();
      } else {
        setError(data.error || 'Could not add stock.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleAddManual() {
    if (!manualSymbol.trim() || !manualName.trim()) return;
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/stock-holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: manualSymbol.trim(),
          name: manualName.trim(),
          initialPrice: manualPrice ? Number(manualPrice) : null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onAdded();
        onClose();
      } else {
        setError(data.error || 'Could not add stock.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Add a stock</h2>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div style={styles.tabs}>
          <button
            style={mode === 'search' ? styles.tabActive : styles.tab}
            onClick={() => setMode('search')}
          >
            Search ticker
          </button>
          <button
            style={mode === 'manual' ? styles.tabActive : styles.tab}
            onClick={() => setMode('manual')}
          >
            Enter manually
          </button>
        </div>

        {mode === 'search' ? (
          <div>
            <input
              style={styles.input}
              type="text"
              placeholder="Search by company or ticker, e.g. Reliance, TCS, AAPL"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              autoFocus
            />
            <p style={styles.hint}>Type at least 2 characters.</p>

            {searching && <p style={styles.statusText}>Searching…</p>}
            {searchError && <p style={styles.error}>{searchError}</p>}

            {results.length > 0 && (
              <div style={styles.resultsList}>
                {results.map((r) => (
                  <button
                    key={r.symbol}
                    style={selected?.symbol === r.symbol ? styles.resultRowSelected : styles.resultRow}
                    onClick={() => setSelected(r)}
                  >
                    <span style={styles.resultName}>{r.shortName}</span>
                    <span style={styles.resultNav}>
                      {r.symbol}
                      {r.exchange && <span style={styles.resultDate}> · {r.exchange}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {error && <p style={styles.error}>{error}</p>}

            <div style={styles.actions}>
              <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
              <button
                style={styles.submitBtn}
                disabled={!selected || saving}
                onClick={handleAddSelected}
              >
                {saving ? 'Adding…' : 'Add stock'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <label style={styles.label}>
              Ticker symbol
              <input
                style={styles.input}
                type="text"
                value={manualSymbol}
                onChange={(e) => setManualSymbol(e.target.value)}
                placeholder="e.g. RELIANCE.NS, TCS.NS, AAPL"
              />
            </label>
            <p style={styles.hint}>
              Use Yahoo Finance ticker format: &ldquo;.NS&rdquo; for NSE, &ldquo;.BO&rdquo; for BSE,
              or the plain ticker for US exchanges.
            </p>
            <label style={styles.label}>
              Company name
              <input
                style={styles.input}
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="e.g. Reliance Industries"
              />
            </label>
            <label style={styles.label}>
              Current price <span style={styles.optional}>(optional)</span>
              <input
                style={styles.input}
                type="number"
                step="0.01"
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
                placeholder="0.00"
              />
            </label>

            {error && <p style={styles.error}>{error}</p>}

            <div style={styles.actions}>
              <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
              <button
                style={styles.submitBtn}
                disabled={!manualSymbol.trim() || !manualName.trim() || saving}
                onClick={handleAddManual}
              >
                {saving ? 'Adding…' : 'Add stock'}
              </button>
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
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '15px',
    border: '1px solid var(--hairline)',
    borderRadius: '3px',
    background: 'var(--paper)',
    color: 'var(--ink)',
    marginBottom: '4px',
  },
  hint: {
    fontSize: '12px',
    color: 'var(--ink-faint)',
    margin: '0 0 14px',
    lineHeight: 1.5,
  },
  statusText: {
    fontSize: '13px',
    color: 'var(--ink-soft)',
  },
  error: {
    fontSize: '13px',
    color: 'var(--brick)',
    margin: '0 0 12px',
  },
  resultsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '260px',
    overflowY: 'auto',
    marginBottom: '12px',
  },
  resultRow: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '3px',
    textAlign: 'left',
    padding: '10px 12px',
    border: '1px solid var(--hairline)',
    borderRadius: '4px',
    background: 'var(--paper)',
  },
  resultRowSelected: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '3px',
    textAlign: 'left',
    padding: '10px 12px',
    border: '1px solid var(--ledger-green)',
    borderRadius: '4px',
    background: 'var(--ledger-green-soft)',
  },
  resultName: {
    fontSize: '13.5px',
    color: 'var(--ink)',
    fontWeight: 500,
  },
  resultNav: {
    fontSize: '12px',
    color: 'var(--ink-soft)',
    fontFamily: 'var(--font-mono)',
  },
  resultDate: {
    color: 'var(--ink-faint)',
  },
  label: {
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
};
