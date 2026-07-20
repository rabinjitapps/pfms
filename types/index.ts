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
// Crypto tracker
// ----------------------------------------------------------------------

export interface Crypto {
  id: string;
  symbol: string;
  name: string;
  exchange: string | null;
  latest_price: number | null;
  latest_price_date: string | null;
  created_at: string;
  updated_at: string;
}

export type CryptoTransactionType = 'BUY' | 'SELL';

export interface CryptoTransaction {
  id: string;
  holding_id: string;
  type: CryptoTransactionType;
  date: string;
  quantity: number;
  price: number;
  amount: number;
  notes: string | null;
  created_at: string;
}

export interface CryptoHolding {
  id: string;
  user_id: string;
  crypto_id: string;
  created_at: string;
  crypto: Crypto;
  transactions: CryptoTransaction[];
}

// Computed, client-facing summary for a crypto holding
export interface CryptoHoldingSummary {
  id: string;
  crypto: Crypto;
  totalQuantity: number;
  investedAmount: number;
  avgPrice: number;
  currentValue: number;
  gainLoss: number;
  gainLossPct: number;
  transactions: CryptoTransaction[];
}

export interface CryptoPortfolioSummary {
  totalInvested: number;
  currentValue: number;
  totalGainLoss: number;
  totalGainLossPct: number;
  holdings: CryptoHoldingSummary[];
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
  // Bank account this entry actually moved money through. Optional — an
  // entry can be left unlinked (e.g. cash). When set, the API mirrors this
  // entry as a matching credit/debit row in that account's bank_transactions
  // ledger, so it shows up there too.
  account_id: string | null;
  // Joined for display only (e.g. "via HDFC Salary Account"); not present
  // on every fetch.
  account?: { id: string; name: string } | null;
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

// Individual entries making up one head's total in the breakdown list —
// fetched on demand when a person clicks a head to see what it's made of.
export interface ExpenseHeadBreakdown {
  categoryId: string;
  categoryName: string;
  entries: ExpenseEntry[];
  total: number;
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
// 'monthly'  = same reducing-balance EMI math as flexi with no interest-only
//              phase, except the person enters the rate as a MONTHLY % (how
//              many short-term/instant-loan lenders quote it) instead of an
//              annual one. interest_rate is still stored as the annual
//              equivalent (monthly rate * 12), so every other screen — the
//              "X% p.a." badge on the loan card, the debt-free countdown,
//              etc. — displays it exactly like any other loan with no
//              special-casing needed.
// 'open'     = open-ended / running-balance loan with NO fixed tenure. There's
//              no pre-generated EMI schedule — instead outstanding_principal
//              is a live balance that the person updates by hand each month
//              via a ledger entry (see LoanLedgerEntry): either "interest
//              only" (auto-charges that month's interest on the current
//              balance, balance untouched) or "payment" (a person-entered ₹
//              amount, split into interest + principal, which reduces the
//              balance). interest_rate is entered directly as an annual %,
//              same as flexi.
export type LoanType = 'standard' | 'flexi' | 'monthly' | 'open';

export interface Loan {
  id: string;
  user_id: string;
  name: string;
  loan_type: LoanType;
  principal: number;
  emi_amount: number;     // standard: the flat EMI. flexi: the EMI for the post-interest-only phase. open: unused (0).
  tenure_value: number;   // open: unused (0) — tenure isn't decided up front.
  tenure_unit: LoanTenureUnit;
  emi_start_date: string; // YYYY-MM-DD — for open loans, the date the loan began.
  total_months: number;   // derived: tenure_value * (unit === 'years' ? 12 : 1). open: unused (0).
  interest_rate: number;  // annual %. standard: auto-calculated from EMI formula. flexi/open: entered directly.
  // Flexi-only fields (0 / 'years' for standard/monthly/open loans):
  interest_only_value: number;        // raw value as entered, e.g. 2
  interest_only_unit: LoanTenureUnit; // unit for interest_only_value
  interest_only_months: number;       // derived: interest_only_value in months
  interest_only_payment: number;      // monthly interest-only installment during the moratorium
  // Open-loan-only field (null for every other loan_type): the live
  // outstanding balance, seeded at creation from principal minus whatever
  // had already been repaid, then updated after every ledger entry.
  outstanding_principal: number | null;
  created_at: string;
  updated_at: string;
  payments?: LoanPayment[]; // manually-marked-paid months, attached by GET /api/loans
  ledger?: LoanLedgerEntry[]; // open loans only: full payment history, attached by GET /api/loans
}

export interface LoanPayment {
  loan_id?: string;
  month: string;   // YYYY-MM
  paid_at: string; // ISO timestamp
}

// A single month's entry in an open-ended loan's running ledger.
export type LoanLedgerEntryType = 'interest_only' | 'payment';

export interface LoanLedgerEntry {
  id: string;
  loan_id?: string;
  entry_date: string;   // YYYY-MM-DD, the date this entry was recorded against
  month: string;         // YYYY-MM
  entry_type: LoanLedgerEntryType;
  amount: number;               // total ₹ paid this entry
  interest_component: number;
  principal_component: number;
  balance_after: number;        // outstanding_principal immediately after this entry
  created_at: string;
}

export type LoanEmiPhase = 'interest_only' | 'emi';

export interface LoanEmiMonth {
  month: string;        // YYYY-MM
  emi_amount: number;
  phase: LoanEmiPhase;      // which part of the loan this month belongs to
  is_paid: boolean;        // auto (date-based) OR manually marked
  manually_paid: boolean;  // explicitly toggled by user
  is_future: boolean;
  principal_component: number; // this month's share of the EMI that goes toward principal
  interest_component: number;  // this month's share of the EMI that is interest
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
  outstanding_principal: number; // of total_amount_pending, the portion that is still-unpaid principal
  outstanding_interest: number; // of total_amount_pending, the portion that is still-unpaid interest
  is_closed: boolean; // true once every EMI is paid off (pending_count === 0)
  // Open loans only (undefined/false for every other loan_type):
  is_open_ended?: boolean;        // true for loan_type === 'open' — tenure/debt-free date are undetermined
  current_interest_due?: number;  // this month's accrued interest on the current outstanding balance
  ledger?: LoanLedgerEntry[];     // full payment history, most recent first
}

export interface LoanPortfolioSummary {
  loans: LoanSummary[]; // active (not yet fully paid off) loans only
  closed_loans: LoanSummary[]; // fully paid-off loans, shown separately
  total_monthly_emi: number;
  total_outstanding: number;
  total_outstanding_principal: number; // of total_outstanding, the principal portion (across active loans)
  total_outstanding_interest: number; // of total_outstanding, the interest portion (across active loans)
  total_interest: number; // sum of total_interest across all loans (running + completed)
  current_month: { month: string; label: string; amount: number }; // this month's total EMI across all active loans
  upcoming_months: {
    month: string;
    label: string;
    amount: number;
    outstanding_after: number; // portfolio total_outstanding projected forward, as it will stand once this month's EMI is paid
    outstanding_after_principal: number; // principal portion of outstanding_after
    outstanding_after_interest: number; // interest portion of outstanding_after
  }[]; // chronological, strictly after the current month
  percent_complete: number; // combined EMI count paid / total EMI count across every loan
  debt_free_date: string; // ISO date of the last EMI across the whole portfolio (the loan that finishes last)
  total_amount_paid: number; // sum of every loan's total_amount_paid, for the debt-free countdown's ₹ figures
}

// ----------------------------------------------------------------------
// Bank account tracker
// ----------------------------------------------------------------------

export type BankTransactionType = 'credit' | 'debit';

export interface BankAccount {
  id: string;
  user_id: string;
  name: string;                       // person's own label, e.g. "HDFC Salary Account"
  bank_name: string | null;           // e.g. "HDFC Bank"
  account_type: string | null;        // e.g. "Savings", "Current"
  account_number_last4: string | null; // last 4 digits only — never store a full account number
  opening_balance: number;
  opening_date: string;               // YYYY-MM-DD
  created_at: string;
  updated_at: string;
}

export interface BankTransaction {
  id: string;
  user_id: string;
  account_id: string;
  date: string;                       // YYYY-MM-DD
  type: BankTransactionType;
  amount: number;                     // always positive; direction comes from `type`
  description: string | null;
  category: string | null;            // free-text label, e.g. "Salary", "Rent"
  // Set on BOTH legs of an internal transfer between two tracked accounts
  // (a debit on the source, a credit on the destination) so the pair can be
  // identified, displayed as one logical "Transfer" entry, and deleted
  // together. Null for an ordinary credit/debit.
  transfer_id: string | null;
  transfer_account_name: string | null; // the OTHER account's name, attached client-side for display only
  // Set when this row was created automatically because an income/expense
  // entry was logged against this account — links back to that entry so an
  // edit or delete on the expense side can keep this mirrored row in sync.
  // Null for a transaction added directly from the Bank Accounts page.
  expense_entry_id: string | null;
  // Set when this row is one half of a credit card payment — the debit
  // here pairs with a 'payment' row in credit_card_transactions sharing
  // this same id. Null for anything unrelated to a credit card.
  credit_card_transaction_id: string | null;
  created_at: string;
}

// A single ledger row with its running balance, as returned within
// BankAccountSummary — chronological ascending order (oldest first) so the
// running balance can be computed left-to-right; the UI reverses it for
// most-recent-first display.
export type BankLedgerEntry = BankTransaction & { running_balance: number };

export interface BankAccountSummary {
  account: BankAccount;
  balance: number; // opening_balance + credits - debits, as of now
  total_credits: number; // all-time, for the account's at-a-glance stats
  total_debits: number;
  transactions: BankLedgerEntry[];
}

export interface BankPortfolioSummary {
  accounts: BankAccountSummary[];
  total_balance: number;
}

// ── Credit cards ─────────────────────────────────────────────────────────
// Modeled as the mirror image of a bank account: a "spend" raises what's
// owed (like a debit lowers a bank balance) and a "payment" lowers it
// (like a credit raises one). statement_day / due_day are just the day-
// of-month (1-31) the card's cycle closes and payment is due — the actual
// dates for "this cycle" are computed client/server-side from those.
export type CreditCardTransactionType = 'spend' | 'payment' | 'refund';

export interface CreditCard {
  id: string;
  user_id: string;
  name: string; // e.g. "HDFC Regalia"
  bank_name: string | null;
  card_network: string | null; // Visa / Mastercard / Rupay / Amex — free text
  card_number_last4: string | null;
  credit_limit: number;
  statement_day: number; // 1-31, day of month the statement is generated
  due_day: number; // 1-31, day of month payment is due (in the cycle after the statement)
  opening_balance: number; // outstanding balance as of opening_date, before transactions logged here
  opening_date: string;
  // Entered manually per statement, since the exact minimum-due formula
  // varies by issuer and offers/EMIs can change it — not auto-calculated.
  current_statement_balance: number | null;
  current_minimum_due: number | null;
  notes: string | null;
  created_at: string;
}

export interface CreditCardTransaction {
  id: string;
  user_id: string;
  card_id: string;
  date: string;
  type: CreditCardTransactionType;
  amount: number;
  description: string | null;
  category: string | null;
  created_at: string;
  // Set when this spend was also logged as an income/expense entry, so it
  // shows up in Expense Analysis too — mirrors expense_entry_id on
  // bank_transactions. Null for a spend that was only ever logged here.
  expense_entry_id: string | null;
  // Set when this payment was also recorded as a debit on a bank account —
  // both rows share this id so they can be identified and deleted as a
  // pair, same pattern as a bank-to-bank transfer_id.
  bank_transaction_id: string | null;
  bank_account_name: string | null; // attached client-side for display only
}

export type CreditCardLedgerEntry = CreditCardTransaction & { running_balance: number };

export interface CreditCardSummary {
  card: CreditCard;
  balance: number; // outstanding amount owed right now
  available_credit: number; // credit_limit - balance, floored at 0 for display
  utilization_pct: number; // balance / credit_limit * 100, 0 if no limit set
  total_spend: number; // all-time
  total_payments: number; // all-time (payments + refunds combined)
  transactions: CreditCardLedgerEntry[];
  // This cycle's due date, computed from due_day relative to today, plus
  // how many days away (negative if overdue) — calendar-accurate the same
  // way the Loans page computes its debt-free countdown.
  next_due_date: string;
  days_until_due: number;
  is_overdue: boolean;
}

export interface CreditCardPortfolioSummary {
  cards: CreditCardSummary[];
  total_balance: number;
  total_credit_limit: number;
  total_available_credit: number;
}
