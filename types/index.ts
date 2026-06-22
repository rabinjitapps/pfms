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
  transactions: Transaction[];
}

export interface PortfolioSummary {
  totalInvested: number;
  currentValue: number;
  totalGainLoss: number;
  totalGainLossPct: number;
  holdings: HoldingSummary[];
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
