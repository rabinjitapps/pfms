export interface Fund {
  id: string;
  scheme_code: string | null;
  name: string;
  fund_house: string | null;
  category: string | null;
  latest_nav: number | null;
  latest_nav_date: string | null;
  created_at: string;
  updated_at: string;
}

export type TransactionType = 'BUY' | 'SELL';

export interface Transaction {
  id: string;
  holding_id: string;
  type: TransactionType;
  date: string;
  units: number;
  nav: number;
  amount: number;
  notes: string | null;
  created_at: string;
}

export interface Holding {
  id: string;
  user_id: string;
  fund_id: string;
  created_at: string;
  fund: Fund;
  transactions: Transaction[];
}

// Computed, client-facing summary for a holding
export interface HoldingSummary {
  id: string;
  fund: Fund;
  totalUnits: number;
  investedAmount: number;
  avgNav: number;
  currentValue: number;
  gainLoss: number;
  gainLossPct: number;
  redeemedAmount: number;
  transactions: Transaction[];
}

export interface PortfolioSummary {
  totalInvested: number;
  currentValue: number;
  totalGainLoss: number;
  totalGainLossPct: number;
  totalRedeemed: number;
  holdings: HoldingSummary[];
}

// ----------------------------------------------------------------------
// Fund growth (invested vs current value over time, for the analysis chart)
// ----------------------------------------------------------------------

export type FundGrowthPeriodType = 'month' | 'year';

export interface FundGrowthPoint {
  period: string;    // 'YYYY-MM' for month granularity, 'YYYY' for year granularity
  invested: number;  // cost basis of units held as of this period's end
  current: number;   // units held as of period end, valued at the NAV on/before period end
}

export interface TermBucket {
  units: number;
  invested: number;
  currentValue: number;
}

// Split of units currently held into "long term" (>= 1 year old, the usual
// equity-MF capital-gains cutoff in India) vs "short term", each lot dated
// by FIFO purchase order. Valued as of today.
export interface TermSplit {
  shortTerm: TermBucket;
  longTerm: TermBucket;
}

export interface BenchmarkOption {
  id: string;
  label: string;
}

// One benchmark's replicated value series, aligned 1:1 with the parent
// FundGrowthData.points array (same `period` ordering).
export interface BenchmarkSeries {
  benchmarkId: string;
  label: string;
  isCategoryDefault: boolean; // true if this is the auto-picked match for the fund's category
  values: number[]; // replicated value at each period, same length/order as points
  returnPct: number; // (latest value - total invested) / total invested * 100
}

export interface FundGrowthData {
  holdingId: string;
  fundName: string;
  periodType: FundGrowthPeriodType;
  points: FundGrowthPoint[];
  availableYears: number[]; // years with at least one transaction, ascending, through the current year
  navEstimated: boolean;    // true if historical NAVs could not be fetched and current value is approximated
  currentUnits?: number;     // units held as of today (omitted for the combined "whole investment" view)
  termSplit?: TermSplit;
  benchmark?: BenchmarkSeries;
  availableBenchmarks?: BenchmarkOption[];
}

// ----------------------------------------------------------------------
// Stock tracker
// ----------------------------------------------------------------------

export interface Stock {
  id: string;
  symbol: string;
  name: string;
  exchange: string | null;
  latest_price: number | null;
  latest_price_date: string | null;
  created_at: string;
  updated_at: string;
}

export type StockTransactionType = 'BUY' | 'SELL';

export interface StockTransaction {
  id: string;
  holding_id: string;
  type: StockTransactionType;
  date: string;
  quantity: number;
  price: number;
  amount: number;
  notes: string | null;
  created_at: string;
}

export interface StockHolding {
  id: string;
  user_id: string;
  stock_id: string;
  created_at: string;
  stock: Stock;
  transactions: StockTransaction[];
}

// Computed, client-facing summary for a stock holding
export interface StockHoldingSummary {
  id: string;
  stock: Stock;
  totalQuantity: number;
  investedAmount: number;
  avgPrice: number;
  currentValue: number;
  gainLoss: number;
  gainLossPct: number;
  transactions: StockTransaction[];
}

export interface StockPortfolioSummary {
  totalInvested: number;
  currentValue: number;
  totalGainLoss: number;
  totalGainLossPct: number;
  holdings: StockHoldingSummary[];
}

// ----------------------------------------------------------------------
// Expense tracker
// ----------------------------------------------------------------------

export type ExpenseCategoryKind = 'INCOME' | 'EXPENSE';
export type ExpenseDirection = 'INFLOW' | 'OUTFLOW';

export interface ExpenseCategory {
  id: string;
  user_id: string;
  name: string;
  kind: ExpenseCategoryKind;
  created_at: string;
}

export interface ExpenseEntry {
  id: string;
  user_id: string;
  category_id: string;
  direction: ExpenseDirection;
  date: string;
  amount: number;
  notes: string | null;
  created_at: string;
  category: ExpenseCategory;
}

export interface ExpenseSummary {
  month: string; // YYYY-MM, the month this summary reflects
  availableMonths: string[]; // YYYY-MM[], sorted ascending — months with at least one entry, plus the current month
  carryForward: number; // running balance brought in from all prior months (can be negative)
  totalInflow: number;
  totalOutflow: number;
  net: number; // this month's inflow minus outflow only (unchanged meaning)
  netWithCarryForward: number; // carryForward + net — the running balance leaving this month
  categories: ExpenseCategory[];
  entries: ExpenseEntry[];
}

// ----------------------------------------------------------------------
// Expense analysis (head-wise bar chart for a month or a year)
// ----------------------------------------------------------------------

export type AnalysisPeriodType = 'month' | 'year';

export interface ExpenseHeadTotal {
  categoryId: string;
  categoryName: string;
  total: number;
}

export interface ExpenseAnalysis {
  periodType: AnalysisPeriodType;
  period: string; // 'YYYY-MM' for month, 'YYYY' for year
  direction: ExpenseDirection;
  availableYears: string[]; // YYYY[], sorted ascending, derived from availableMonths
  totals: ExpenseHeadTotal[]; // only heads with a nonzero total in this period, sorted descending
  grandTotal: number;
}

// ----------------------------------------------------------------------
// Bulk import (Excel upload)
// ----------------------------------------------------------------------

// A single row that failed to import, with a 1-based Excel row number
// (matching the visible spreadsheet row, header included) and a
// human-readable reason. Shared by both bulk import endpoints below.
export interface BulkImportRowError {
  row: number;
  message: string;
}

// Response shape for POST /api/expense-entries/bulk
export interface BulkImportResult {
  imported: number;
  skipped: number;
  errors: BulkImportRowError[];
  createdHeads: string[]; // names of income/expense heads auto-created during this import
}

// Response shape for POST /api/transactions/bulk
export interface FundBulkImportResult {
  imported: number;
  skipped: number;
  errors: BulkImportRowError[];
  createdFunds: string[]; // names of funds auto-created during this import
}

// ----------------------------------------------------------------------
// Loan tracker
// ----------------------------------------------------------------------

export type LoanTenureUnit = 'months' | 'years';

// 'standard' = flat EMI for the whole tenure (rate is back-calculated from EMI).
// 'flexi'    = interest-only for an initial period, then converts to EMI for
//              the remaining tenure (rate is entered directly; both the
//              interest-only installment and the post-conversion EMI are
//              derived from it).
export type LoanType = 'standard' | 'flexi';

export interface Loan {
  id: string;
  user_id: string;
  name: string;
  loan_type: LoanType;
  principal: number;
  emi_amount: number;     // standard: the flat EMI. flexi: the EMI for the post-interest-only phase.
  tenure_value: number;
  tenure_unit: LoanTenureUnit;
  emi_start_date: string; // YYYY-MM-DD
  total_months: number;   // derived: tenure_value * (unit === 'years' ? 12 : 1)
  interest_rate: number;  // annual %. standard: auto-calculated from EMI formula. flexi: entered directly.
  // Flexi-only fields (0 / 'years' for standard loans):
  interest_only_value: number;        // raw value as entered, e.g. 2
  interest_only_unit: LoanTenureUnit; // unit for interest_only_value
  interest_only_months: number;       // derived: interest_only_value in months
  interest_only_payment: number;      // monthly interest-only installment during the moratorium
  created_at: string;
  updated_at: string;
  payments?: LoanPayment[]; // manually-marked-paid months, attached by GET /api/loans
}

export interface LoanPayment {
  loan_id?: string;
  month: string;   // YYYY-MM
  paid_at: string; // ISO timestamp
}

export type LoanEmiPhase = 'interest_only' | 'emi';

export interface LoanEmiMonth {
  month: string;        // YYYY-MM
  emi_amount: number;
  phase: LoanEmiPhase;      // which part of the loan this month belongs to
  is_paid: boolean;        // auto (date-based) OR manually marked
  manually_paid: boolean;  // explicitly toggled by user
  is_future: boolean;
}

export interface LoanSummary {
  loan: Loan;
  paid_count: number;
  pending_count: number;
  total_emis: number;
  total_amount_paid: number;
  total_amount_pending: number;
  percent_complete: number;
  debt_free_date: string; // ISO date of last EMI
  months_remaining: number;
  years_remaining: number;
  emi_schedule: LoanEmiMonth[];
  in_interest_only_phase: boolean; // true if the current/next-due month is still interest-only
  interest_only_months_remaining: number;
  total_interest: number; // total interest over the full loan tenure (running + completed)
}

export interface LoanPortfolioSummary {
  loans: LoanSummary[];
  total_monthly_emi: number;
  total_outstanding: number;
  total_interest: number; // sum of total_interest across all loans (running + completed)
  upcoming_months: { month: string; label: string; amount: number }[]; // chronological, strictly after the current month
}
