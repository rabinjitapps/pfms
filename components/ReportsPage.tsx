'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PortfolioSummary,
  StockPortfolioSummary,
  CryptoPortfolioSummary,
  ExpenseEntry,
  ExpenseCategory,
} from '@/types';
import AppShell from './AppShell';
import { exportReportToExcel, exportReportToPdf, ReportColumn } from '@/lib/reportExport';
import styles from './ReportsPage.module.css';

type Tab = 'funds' | 'stocks' | 'crypto' | 'expenses';

function formatINR(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function todayYear(): string {
  return String(new Date().getFullYear());
}

const MONTH_NAMES = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

// ----------------------------------------------------------------------
// Row shapes for each report
// ----------------------------------------------------------------------

interface FundTxRow {
  date: string;
  fundName: string;
  type: string;
  units: number;
  nav: number;
  amount: number;
  currentValue: number;
  priceDiff: number;
  returnPct: number;
  notes: string;
}

interface StockTxRow {
  date: string;
  stockName: string;
  symbol: string;
  type: string;
  quantity: number;
  price: number;
  amount: number;
  currentValue: number;
  priceDiff: number;
  returnPct: number;
  notes: string;
}

interface CryptoTxRow {
  date: string;
  cryptoName: string;
  symbol: string;
  type: string;
  quantity: number;
  price: number;
  amount: number;
  currentValue: number;
  priceDiff: number;
  returnPct: number;
  notes: string;
}

interface ExpenseTxRow {
  date: string;
  head: string;
  kind: string; // 'Income' | 'Expense'
  amount: number;
  notes: string;
}

interface ExpenseHeadRow {
  head: string;
  kind: string;
  count: number;
  total: number;
}

export default function ReportsPage({ displayName }: { displayName: string }) {
  const [tab, setTab] = useState<Tab>('funds');

  const [funds, setFunds] = useState<PortfolioSummary | null>(null);
  const [stocks, setStocks] = useState<StockPortfolioSummary | null>(null);
  const [crypto, setCrypto] = useState<CryptoPortfolioSummary | null>(null);
  const [expenseEntries, setExpenseEntries] = useState<ExpenseEntry[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [fundsRes, stocksRes, cryptoRes, expensesRes] = await Promise.all([
        fetch('/api/holdings'),
        fetch('/api/stock-holdings'),
        fetch('/api/crypto-holdings'),
        fetch('/api/reports/expenses'),
      ]);
      if (!fundsRes.ok || !stocksRes.ok || !cryptoRes.ok || !expensesRes.ok) {
        setError('Could not load all of your data. Some reports below may be incomplete.');
      }
      const [fundsData, stocksData, cryptoData, expensesData] = await Promise.all([
        fundsRes.ok ? fundsRes.json() : null,
        stocksRes.ok ? stocksRes.json() : null,
        cryptoRes.ok ? cryptoRes.json() : null,
        expensesRes.ok ? expensesRes.json() : null,
      ]);
      setFunds(fundsData);
      setStocks(stocksData);
      setCrypto(cryptoData);
      setExpenseEntries(expensesData?.entries ?? []);
      setExpenseCategories(expensesData?.categories ?? []);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Funds tab state ──────────────────────────────────────────────────
  const [fundId, setFundId] = useState('all');
  const [fundFrom, setFundFrom] = useState('');
  const [fundTo, setFundTo] = useState('');

  const fundRows = useMemo<FundTxRow[]>(() => {
    const holdings = funds?.holdings ?? [];
    const rows: FundTxRow[] = [];
    for (const h of holdings) {
      if (fundId !== 'all' && h.id !== fundId) continue;
      const currentNav = Number(h.fund.latest_nav ?? 0);
      for (const t of h.transactions) {
        if (fundFrom && t.date < fundFrom) continue;
        if (fundTo && t.date > fundTo) continue;
        const amount = Number(t.amount);
        const currentValue = Number(t.units) * currentNav;
        const priceDiff = currentValue - amount;
        rows.push({
          date: t.date,
          fundName: h.fund.name,
          type: t.type,
          units: Number(t.units),
          nav: Number(t.nav),
          amount,
          currentValue,
          priceDiff,
          returnPct: amount > 0 ? (priceDiff / amount) * 100 : 0,
          notes: t.notes ?? '',
        });
      }
    }
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return rows;
  }, [funds, fundId, fundFrom, fundTo]);

  const fundColumns: ReportColumn<FundTxRow>[] = [
    { key: 'date', label: 'Date', format: (r) => formatDate(r.date) },
    { key: 'fundName', label: 'Fund' },
    { key: 'type', label: 'Type' },
    { key: 'units', label: 'Units', align: 'right', format: (r) => r.units.toLocaleString('en-IN', { maximumFractionDigits: 4 }) },
    { key: 'nav', label: 'NAV', align: 'right', format: (r) => r.nav.toFixed(2) },
    { key: 'amount', label: 'Amount', align: 'right', format: (r) => formatINR(r.amount) },
    { key: 'currentValue', label: 'Current Value', align: 'right', format: (r) => formatINR(r.currentValue) },
    { key: 'priceDiff', label: 'Price Diff', align: 'right', format: (r) => `${r.priceDiff >= 0 ? '+' : ''}${formatINR(r.priceDiff)}` },
    { key: 'returnPct', label: 'Return %', align: 'right', format: (r) => `${r.returnPct >= 0 ? '+' : ''}${r.returnPct.toFixed(2)}%` },
    { key: 'notes', label: 'Notes' },
  ];

  const fundTotal = useMemo(() => fundRows.reduce((s, r) => s + (r.type === 'SELL' ? -r.amount : r.amount), 0), [fundRows]);

  // ── Stocks tab state ─────────────────────────────────────────────────
  const [stockId, setStockId] = useState('all');
  const [stockFrom, setStockFrom] = useState('');
  const [stockTo, setStockTo] = useState('');

  const stockRows = useMemo<StockTxRow[]>(() => {
    const holdings = stocks?.holdings ?? [];
    const rows: StockTxRow[] = [];
    for (const h of holdings) {
      if (stockId !== 'all' && h.id !== stockId) continue;
      const currentPrice = Number(h.stock.latest_price ?? 0);
      for (const t of h.transactions) {
        if (stockFrom && t.date < stockFrom) continue;
        if (stockTo && t.date > stockTo) continue;
        const amount = Number(t.amount);
        const currentValue = Number(t.quantity) * currentPrice;
        const priceDiff = currentValue - amount;
        rows.push({
          date: t.date,
          stockName: h.stock.name,
          symbol: h.stock.symbol,
          type: t.type,
          quantity: Number(t.quantity),
          price: Number(t.price),
          amount,
          currentValue,
          priceDiff,
          returnPct: amount > 0 ? (priceDiff / amount) * 100 : 0,
          notes: t.notes ?? '',
        });
      }
    }
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return rows;
  }, [stocks, stockId, stockFrom, stockTo]);

  const stockColumns: ReportColumn<StockTxRow>[] = [
    { key: 'date', label: 'Date', format: (r) => formatDate(r.date) },
    { key: 'stockName', label: 'Stock' },
    { key: 'symbol', label: 'Symbol' },
    { key: 'type', label: 'Type' },
    { key: 'quantity', label: 'Quantity', align: 'right', format: (r) => r.quantity.toLocaleString('en-IN', { maximumFractionDigits: 4 }) },
    { key: 'price', label: 'Price', align: 'right', format: (r) => r.price.toFixed(2) },
    { key: 'amount', label: 'Amount', align: 'right', format: (r) => formatINR(r.amount) },
    { key: 'currentValue', label: 'Current Value', align: 'right', format: (r) => formatINR(r.currentValue) },
    { key: 'priceDiff', label: 'Price Diff', align: 'right', format: (r) => `${r.priceDiff >= 0 ? '+' : ''}${formatINR(r.priceDiff)}` },
    { key: 'returnPct', label: 'Return %', align: 'right', format: (r) => `${r.returnPct >= 0 ? '+' : ''}${r.returnPct.toFixed(2)}%` },
    { key: 'notes', label: 'Notes' },
  ];

  const stockTotal = useMemo(() => stockRows.reduce((s, r) => s + (r.type === 'SELL' ? -r.amount : r.amount), 0), [stockRows]);

  // ── Crypto tab state ──────────────────────────────────────────────────
  const [cryptoId, setCryptoId] = useState('all');
  const [cryptoFrom, setCryptoFrom] = useState('');
  const [cryptoTo, setCryptoTo] = useState('');

  const cryptoRows = useMemo<CryptoTxRow[]>(() => {
    const holdings = crypto?.holdings ?? [];
    const rows: CryptoTxRow[] = [];
    for (const h of holdings) {
      if (cryptoId !== 'all' && h.id !== cryptoId) continue;
      const currentPrice = Number(h.crypto.latest_price ?? 0);
      for (const t of h.transactions) {
        if (cryptoFrom && t.date < cryptoFrom) continue;
        if (cryptoTo && t.date > cryptoTo) continue;
        const amount = Number(t.amount);
        const currentValue = Number(t.quantity) * currentPrice;
        const priceDiff = currentValue - amount;
        rows.push({
          date: t.date,
          cryptoName: h.crypto.name,
          symbol: h.crypto.symbol,
          type: t.type,
          quantity: Number(t.quantity),
          price: Number(t.price),
          amount,
          currentValue,
          priceDiff,
          returnPct: amount > 0 ? (priceDiff / amount) * 100 : 0,
          notes: t.notes ?? '',
        });
      }
    }
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return rows;
  }, [crypto, cryptoId, cryptoFrom, cryptoTo]);

  const cryptoColumns: ReportColumn<CryptoTxRow>[] = [
    { key: 'date', label: 'Date', format: (r) => formatDate(r.date) },
    { key: 'cryptoName', label: 'Crypto' },
    { key: 'symbol', label: 'Symbol' },
    { key: 'type', label: 'Type' },
    { key: 'quantity', label: 'Quantity', align: 'right', format: (r) => r.quantity.toLocaleString('en-IN', { maximumFractionDigits: 8 }) },
    { key: 'price', label: 'Price', align: 'right', format: (r) => r.price.toFixed(2) },
    { key: 'amount', label: 'Amount', align: 'right', format: (r) => formatINR(r.amount) },
    { key: 'currentValue', label: 'Current Value', align: 'right', format: (r) => formatINR(r.currentValue) },
    { key: 'priceDiff', label: 'Price Diff', align: 'right', format: (r) => `${r.priceDiff >= 0 ? '+' : ''}${formatINR(r.priceDiff)}` },
    { key: 'returnPct', label: 'Return %', align: 'right', format: (r) => `${r.returnPct >= 0 ? '+' : ''}${r.returnPct.toFixed(2)}%` },
    { key: 'notes', label: 'Notes' },
  ];

  const cryptoTotal = useMemo(() => cryptoRows.reduce((s, r) => s + (r.type === 'SELL' ? -r.amount : r.amount), 0), [cryptoRows]);

  // ── Expenses tab state ───────────────────────────────────────────────
  const [periodMode, setPeriodMode] = useState<'consolidated' | 'yearly' | 'monthly'>('consolidated');
  const [expYear, setExpYear] = useState(todayYear());
  const [monthSelYear, setMonthSelYear] = useState(todayYear());
  const [monthSelMonth, setMonthSelMonth] = useState(todayMonth().slice(5, 7));
  const [groupBy, setGroupBy] = useState<'transactions' | 'headwise'>('transactions');
  const [direction, setDirection] = useState<'all' | 'INFLOW' | 'OUTFLOW'>('all');
  const [headFilter, setHeadFilter] = useState('all');

  const expMonth = `${monthSelYear}-${monthSelMonth}`;

  const availableYears = useMemo(() => {
    const years = new Set(expenseEntries.map((e) => e.date.slice(0, 4)));
    years.add(todayYear());
    return Array.from(years).sort();
  }, [expenseEntries]);

  const periodFilteredEntries = useMemo(() => {
    let rows = expenseEntries;
    if (periodMode === 'yearly') {
      rows = rows.filter((e) => e.date.slice(0, 4) === expYear);
    } else if (periodMode === 'monthly') {
      rows = rows.filter((e) => e.date.slice(0, 7) === expMonth);
    }
    if (direction !== 'all') {
      rows = rows.filter((e) => e.direction === direction);
    }
    if (headFilter !== 'all') {
      rows = rows.filter((e) => e.category_id === headFilter);
    }
    return rows;
  }, [expenseEntries, periodMode, expYear, expMonth, direction, headFilter]);

  const expenseTxRows = useMemo<ExpenseTxRow[]>(() => {
    return [...periodFilteredEntries]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((e) => ({
        date: e.date,
        head: e.category?.name ?? '—',
        kind: e.direction === 'INFLOW' ? 'Income' : 'Expense',
        amount: Number(e.amount),
        notes: e.notes ?? '',
      }));
  }, [periodFilteredEntries]);

  const expenseHeadRows = useMemo<ExpenseHeadRow[]>(() => {
    const map = new Map<string, ExpenseHeadRow>();
    for (const e of periodFilteredEntries) {
      const head = e.category?.name ?? '—';
      const kind = e.direction === 'INFLOW' ? 'Income' : 'Expense';
      const key = `${head}::${kind}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.total += Number(e.amount);
      } else {
        map.set(key, { head, kind, count: 1, total: Number(e.amount) });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [periodFilteredEntries]);

  const expenseTxColumns: ReportColumn<ExpenseTxRow>[] = [
    { key: 'date', label: 'Date', format: (r) => formatDate(r.date) },
    { key: 'head', label: 'Head' },
    { key: 'kind', label: 'Type' },
    { key: 'amount', label: 'Amount', align: 'right', format: (r) => formatINR(r.amount) },
    { key: 'notes', label: 'Notes' },
  ];

  const expenseHeadColumns: ReportColumn<ExpenseHeadRow>[] = [
    { key: 'head', label: 'Head' },
    { key: 'kind', label: 'Type' },
    { key: 'count', label: 'Entries', align: 'right' },
    { key: 'total', label: 'Total Amount', align: 'right', format: (r) => formatINR(r.total) },
  ];

  const expenseInflowTotal = useMemo(
    () => periodFilteredEntries.filter((e) => e.direction === 'INFLOW').reduce((s, e) => s + Number(e.amount), 0),
    [periodFilteredEntries]
  );
  const expenseOutflowTotal = useMemo(
    () => periodFilteredEntries.filter((e) => e.direction === 'OUTFLOW').reduce((s, e) => s + Number(e.amount), 0),
    [periodFilteredEntries]
  );

  // ── Export ───────────────────────────────────────────────────────────
  function periodLabel(): string {
    if (tab === 'expenses') {
      if (periodMode === 'yearly') return expYear;
      if (periodMode === 'monthly') return expMonth;
      return 'all-time';
    }
    return new Date().toISOString().slice(0, 10);
  }

  function handleExport(format: 'excel' | 'pdf') {
    if (tab === 'funds') {
      const filename = `mutual-fund-transactions-${periodLabel()}`;
      if (format === 'excel') exportReportToExcel(fundRows, fundColumns, filename, 'Fund Transactions');
      else exportReportToPdf(fundRows, fundColumns, filename, 'Mutual Fund Transaction Report');
    } else if (tab === 'stocks') {
      const filename = `stock-transactions-${periodLabel()}`;
      if (format === 'excel') exportReportToExcel(stockRows, stockColumns, filename, 'Stock Transactions');
      else exportReportToPdf(stockRows, stockColumns, filename, 'Stock Transaction Report');
    } else if (tab === 'crypto') {
      const filename = `crypto-transactions-${periodLabel()}`;
      if (format === 'excel') exportReportToExcel(cryptoRows, cryptoColumns, filename, 'Crypto Transactions');
      else exportReportToPdf(cryptoRows, cryptoColumns, filename, 'Crypto Transaction Report');
    } else {
      const filename = `expense-report-${periodMode}-${periodLabel()}`;
      if (groupBy === 'transactions') {
        if (format === 'excel') exportReportToExcel(expenseTxRows, expenseTxColumns, filename, 'Transactions');
        else exportReportToPdf(expenseTxRows, expenseTxColumns, filename, 'Expense Transaction Report');
      } else {
        if (format === 'excel') exportReportToExcel(expenseHeadRows, expenseHeadColumns, filename, 'Head-wise');
        else exportReportToPdf(expenseHeadRows, expenseHeadColumns, filename, 'Head-wise Expense Report');
      }
    }
  }

  const rowCount =
    tab === 'funds' ? fundRows.length : tab === 'stocks' ? stockRows.length : tab === 'crypto' ? cryptoRows.length : groupBy === 'transactions' ? expenseTxRows.length : expenseHeadRows.length;

  if (loading) {
    return (
      <AppShell active="reports" displayName={displayName}>
        <div className={styles.page}>
          <p className={styles.loadingText}>Loading your reports…</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell active="reports" displayName={displayName}>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <span className={styles.eyebrow}>Reports</span>
          <h2 className={styles.pageTitle}>Reports</h2>
        </header>

        <main className={styles.main}>
          {error && <p className={styles.errorBanner}>{error}</p>}

          <div className={styles.tabRow}>
            <button
              className={tab === 'funds' ? styles.tabBtnActive : styles.tabBtn}
              onClick={() => setTab('funds')}
            >
              Mutual Fund Transactions
            </button>
            <button
              className={tab === 'stocks' ? styles.tabBtnActive : styles.tabBtn}
              onClick={() => setTab('stocks')}
            >
              Stock Transactions
            </button>
            <button
              className={tab === 'crypto' ? styles.tabBtnActive : styles.tabBtn}
              onClick={() => setTab('crypto')}
            >
              Crypto Transactions
            </button>
            <button
              className={tab === 'expenses' ? styles.tabBtnActive : styles.tabBtn}
              onClick={() => setTab('expenses')}
            >
              Expense Transactions
            </button>
          </div>

          {/* ── Funds filter bar ──────────────────────────────────────── */}
          {tab === 'funds' && (
            <div className={styles.filterBar}>
              <label className={styles.filterField}>
                <span>Fund</span>
                <select value={fundId} onChange={(e) => setFundId(e.target.value)}>
                  <option value="all">All funds</option>
                  {(funds?.holdings ?? []).map((h) => (
                    <option key={h.id} value={h.id}>{h.fund.name}</option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>From</span>
                <input type="date" value={fundFrom} onChange={(e) => setFundFrom(e.target.value)} />
              </label>
              <label className={styles.filterField}>
                <span>To</span>
                <input type="date" value={fundTo} onChange={(e) => setFundTo(e.target.value)} />
              </label>
              {(fundFrom || fundTo || fundId !== 'all') && (
                <button className={styles.clearBtn} onClick={() => { setFundId('all'); setFundFrom(''); setFundTo(''); }}>
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* ── Stocks filter bar ─────────────────────────────────────── */}
          {tab === 'stocks' && (
            <div className={styles.filterBar}>
              <label className={styles.filterField}>
                <span>Stock</span>
                <select value={stockId} onChange={(e) => setStockId(e.target.value)}>
                  <option value="all">All stocks</option>
                  {(stocks?.holdings ?? []).map((h) => (
                    <option key={h.id} value={h.id}>{h.stock.name} ({h.stock.symbol})</option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>From</span>
                <input type="date" value={stockFrom} onChange={(e) => setStockFrom(e.target.value)} />
              </label>
              <label className={styles.filterField}>
                <span>To</span>
                <input type="date" value={stockTo} onChange={(e) => setStockTo(e.target.value)} />
              </label>
              {(stockFrom || stockTo || stockId !== 'all') && (
                <button className={styles.clearBtn} onClick={() => { setStockId('all'); setStockFrom(''); setStockTo(''); }}>
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* ── Crypto filter bar ─────────────────────────────────────── */}
          {tab === 'crypto' && (
            <div className={styles.filterBar}>
              <label className={styles.filterField}>
                <span>Crypto</span>
                <select value={cryptoId} onChange={(e) => setCryptoId(e.target.value)}>
                  <option value="all">All cryptos</option>
                  {(crypto?.holdings ?? []).map((h) => (
                    <option key={h.id} value={h.id}>{h.crypto.name} ({h.crypto.symbol})</option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>From</span>
                <input type="date" value={cryptoFrom} onChange={(e) => setCryptoFrom(e.target.value)} />
              </label>
              <label className={styles.filterField}>
                <span>To</span>
                <input type="date" value={cryptoTo} onChange={(e) => setCryptoTo(e.target.value)} />
              </label>
              {(cryptoFrom || cryptoTo || cryptoId !== 'all') && (
                <button className={styles.clearBtn} onClick={() => { setCryptoId('all'); setCryptoFrom(''); setCryptoTo(''); }}>
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* ── Expenses filter bar ───────────────────────────────────── */}
          {tab === 'expenses' && (
            <div className={styles.filterBar}>
              <label className={styles.filterField}>
                <span>Period</span>
                <select value={periodMode} onChange={(e) => setPeriodMode(e.target.value as typeof periodMode)}>
                  <option value="consolidated">Consolidated (all time)</option>
                  <option value="yearly">Year-wise</option>
                  <option value="monthly">Month-wise</option>
                </select>
              </label>
              {periodMode === 'yearly' && (
                <label className={styles.filterField}>
                  <span>Year</span>
                  <select value={expYear} onChange={(e) => setExpYear(e.target.value)}>
                    {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
              )}
              {periodMode === 'monthly' && (
                <>
                  <label className={styles.filterField}>
                    <span>Year</span>
                    <select value={monthSelYear} onChange={(e) => setMonthSelYear(e.target.value)}>
                      {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </label>
                  <label className={styles.filterField}>
                    <span>Month</span>
                    <select value={monthSelMonth} onChange={(e) => setMonthSelMonth(e.target.value)}>
                      {MONTH_NAMES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </label>
                </>
              )}
              <label className={styles.filterField}>
                <span>Group by</span>
                <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}>
                  <option value="transactions">Transactions</option>
                  <option value="headwise">Income/Expense head-wise</option>
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Type</span>
                <select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
                  <option value="all">Income &amp; Expense</option>
                  <option value="INFLOW">Income only</option>
                  <option value="OUTFLOW">Expense only</option>
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Head</span>
                <select value={headFilter} onChange={(e) => setHeadFilter(e.target.value)}>
                  <option value="all">All heads</option>
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* ── Summary strip ─────────────────────────────────────────── */}
          <div className={styles.summaryStrip}>
            <span className={styles.rowCount}>{rowCount} row{rowCount === 1 ? '' : 's'}</span>
            {tab === 'funds' && (
              <span className={fundTotal >= 0 ? styles.totalPositive : styles.totalNegative}>
                Net invested: {fundTotal >= 0 ? '+' : ''}₹{formatINR(fundTotal)}
              </span>
            )}
            {tab === 'stocks' && (
              <span className={stockTotal >= 0 ? styles.totalPositive : styles.totalNegative}>
                Net invested: {stockTotal >= 0 ? '+' : ''}₹{formatINR(stockTotal)}
              </span>
            )}
            {tab === 'crypto' && (
              <span className={cryptoTotal >= 0 ? styles.totalPositive : styles.totalNegative}>
                Net invested: {cryptoTotal >= 0 ? '+' : ''}₹{formatINR(cryptoTotal)}
              </span>
            )}
            {tab === 'expenses' && (
              <>
                <span className={styles.totalPositive}>Income: ₹{formatINR(expenseInflowTotal)}</span>
                <span className={styles.totalNegative}>Expense: ₹{formatINR(expenseOutflowTotal)}</span>
              </>
            )}
            <div className={styles.exportBtns}>
              <button className={styles.exportBtn} onClick={() => handleExport('excel')} disabled={rowCount === 0}>
                ⬇ Excel
              </button>
              <button className={styles.exportBtn} onClick={() => handleExport('pdf')} disabled={rowCount === 0}>
                ⬇ PDF
              </button>
            </div>
          </div>

          {/* ── Table ──────────────────────────────────────────────────── */}
          <div className={styles.tableWrap}>
            {tab === 'funds' && <FundsTable rows={fundRows} />}
            {tab === 'stocks' && <StocksTable rows={stockRows} />}
            {tab === 'crypto' && <CryptoTable rows={cryptoRows} />}
            {tab === 'expenses' && groupBy === 'transactions' && <ExpenseTxTable rows={expenseTxRows} />}
            {tab === 'expenses' && groupBy === 'headwise' && <ExpenseHeadTable rows={expenseHeadRows} />}
          </div>
        </main>
      </div>
    </AppShell>
  );
}

// ----------------------------------------------------------------------
// Table sub-components
// ----------------------------------------------------------------------

function FundsTable({ rows }: { rows: FundTxRow[] }) {
  if (rows.length === 0) return <p className={styles.emptyText}>No fund transactions match these filters.</p>;
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Date</th><th>Fund</th><th>Type</th><th className={styles.rightCol}>Units</th>
          <th className={styles.rightCol}>NAV</th><th className={styles.rightCol}>Amount</th>
          <th className={styles.rightCol}>Current Value</th>
          <th className={styles.rightCol}>Price Diff</th>
          <th className={styles.rightCol}>Return %</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{formatDate(r.date)}</td>
            <td>{r.fundName}</td>
            <td><span className={r.type === 'BUY' ? styles.tagBuy : styles.tagSell}>{r.type}</span></td>
            <td className={styles.rightCol}>{r.units.toLocaleString('en-IN', { maximumFractionDigits: 4 })}</td>
            <td className={styles.rightCol}>₹{r.nav.toFixed(2)}</td>
            <td className={styles.rightCol}>₹{formatINR(r.amount)}</td>
            <td className={styles.rightCol}>₹{formatINR(r.currentValue)}</td>
            <td className={`${styles.rightCol} ${r.priceDiff >= 0 ? styles.totalPositive : styles.totalNegative}`}>
              {r.priceDiff >= 0 ? '+' : ''}₹{formatINR(r.priceDiff)}
            </td>
            <td className={`${styles.rightCol} ${r.returnPct >= 0 ? styles.totalPositive : styles.totalNegative}`}>
              {r.returnPct >= 0 ? '+' : ''}{r.returnPct.toFixed(2)}%
            </td>
            <td className={styles.notesCol}>{r.notes}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StocksTable({ rows }: { rows: StockTxRow[] }) {
  if (rows.length === 0) return <p className={styles.emptyText}>No stock transactions match these filters.</p>;
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Date</th><th>Stock</th><th>Symbol</th><th>Type</th>
          <th className={styles.rightCol}>Qty</th><th className={styles.rightCol}>Price</th>
          <th className={styles.rightCol}>Amount</th><th className={styles.rightCol}>Current Value</th>
          <th className={styles.rightCol}>Price Diff</th>
          <th className={styles.rightCol}>Return %</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{formatDate(r.date)}</td>
            <td>{r.stockName}</td>
            <td>{r.symbol}</td>
            <td><span className={r.type === 'BUY' ? styles.tagBuy : styles.tagSell}>{r.type}</span></td>
            <td className={styles.rightCol}>{r.quantity.toLocaleString('en-IN', { maximumFractionDigits: 4 })}</td>
            <td className={styles.rightCol}>₹{r.price.toFixed(2)}</td>
            <td className={styles.rightCol}>₹{formatINR(r.amount)}</td>
            <td className={styles.rightCol}>₹{formatINR(r.currentValue)}</td>
            <td className={`${styles.rightCol} ${r.priceDiff >= 0 ? styles.totalPositive : styles.totalNegative}`}>
              {r.priceDiff >= 0 ? '+' : ''}₹{formatINR(r.priceDiff)}
            </td>
            <td className={`${styles.rightCol} ${r.returnPct >= 0 ? styles.totalPositive : styles.totalNegative}`}>
              {r.returnPct >= 0 ? '+' : ''}{r.returnPct.toFixed(2)}%
            </td>
            <td className={styles.notesCol}>{r.notes}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CryptoTable({ rows }: { rows: CryptoTxRow[] }) {
  if (rows.length === 0) return <p className={styles.emptyText}>No crypto transactions match these filters.</p>;
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Date</th><th>Crypto</th><th>Symbol</th><th>Type</th>
          <th className={styles.rightCol}>Qty</th><th className={styles.rightCol}>Price</th>
          <th className={styles.rightCol}>Amount</th><th className={styles.rightCol}>Current Value</th>
          <th className={styles.rightCol}>Price Diff</th>
          <th className={styles.rightCol}>Return %</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{formatDate(r.date)}</td>
            <td>{r.cryptoName}</td>
            <td>{r.symbol}</td>
            <td><span className={r.type === 'BUY' ? styles.tagBuy : styles.tagSell}>{r.type}</span></td>
            <td className={styles.rightCol}>{r.quantity.toLocaleString('en-IN', { maximumFractionDigits: 8 })}</td>
            <td className={styles.rightCol}>₹{r.price.toFixed(2)}</td>
            <td className={styles.rightCol}>₹{formatINR(r.amount)}</td>
            <td className={styles.rightCol}>₹{formatINR(r.currentValue)}</td>
            <td className={`${styles.rightCol} ${r.priceDiff >= 0 ? styles.totalPositive : styles.totalNegative}`}>
              {r.priceDiff >= 0 ? '+' : ''}₹{formatINR(r.priceDiff)}
            </td>
            <td className={`${styles.rightCol} ${r.returnPct >= 0 ? styles.totalPositive : styles.totalNegative}`}>
              {r.returnPct >= 0 ? '+' : ''}{r.returnPct.toFixed(2)}%
            </td>
            <td className={styles.notesCol}>{r.notes}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ExpenseTxTable({ rows }: { rows: ExpenseTxRow[] }) {
  if (rows.length === 0) return <p className={styles.emptyText}>No entries match these filters.</p>;
  return (
    <table className={styles.table}>
      <thead>
        <tr><th>Date</th><th>Head</th><th>Type</th><th className={styles.rightCol}>Amount</th><th>Notes</th></tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{formatDate(r.date)}</td>
            <td>{r.head}</td>
            <td><span className={r.kind === 'Income' ? styles.tagBuy : styles.tagSell}>{r.kind}</span></td>
            <td className={styles.rightCol}>₹{formatINR(r.amount)}</td>
            <td className={styles.notesCol}>{r.notes}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ExpenseHeadTable({ rows }: { rows: ExpenseHeadRow[] }) {
  if (rows.length === 0) return <p className={styles.emptyText}>No entries match these filters.</p>;
  return (
    <table className={styles.table}>
      <thead>
        <tr><th>Head</th><th>Type</th><th className={styles.rightCol}>Entries</th><th className={styles.rightCol}>Total amount</th></tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.head}</td>
            <td><span className={r.kind === 'Income' ? styles.tagBuy : styles.tagSell}>{r.kind}</span></td>
            <td className={styles.rightCol}>{r.count}</td>
            <td className={styles.rightCol}>₹{formatINR(r.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
