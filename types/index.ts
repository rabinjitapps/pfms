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
