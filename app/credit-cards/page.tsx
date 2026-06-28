-- Credit Card Management — run this in the Supabase SQL editor.
-- Safe to run on your existing database: every statement is idempotent
-- (if not exists), so it won't touch any data you already have.

-- ----------------------------------------------------------------------
-- Credit cards — same ledger shape as bank_accounts/bank_transactions,
-- but tracking what's owed (outstanding balance) rather than what's held.
-- A "spend" raises the balance, a "payment" or "refund" lowers it.
-- ----------------------------------------------------------------------

create table if not exists credit_cards (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  bank_name text,
  card_network text,
  card_number_last4 text,
  credit_limit numeric(14,2) not null default 0,
  statement_day smallint not null default 1 check (statement_day between 1 and 31),
  due_day smallint not null default 1 check (due_day between 1 and 31),
  opening_balance numeric(14,2) not null default 0,
  opening_date date not null default current_date,
  -- Entered manually each statement — minimum-due formulas vary by issuer
  -- and can change with offers/EMIs, so this isn't auto-calculated.
  current_statement_balance numeric(14,2),
  current_minimum_due numeric(14,2),
  notes text,
  created_at timestamptz default now()
);

create table if not exists credit_card_transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  card_id uuid not null references credit_cards(id) on delete cascade,
  date date not null,
  type text not null check (type in ('spend', 'payment', 'refund')),
  amount numeric(14,2) not null check (amount > 0),
  description text,
  category text,
  created_at timestamptz default now(),
  -- Set when a spend was also logged as an income/expense entry (so it
  -- shows up in Expense Analysis by category). Cascades so deleting the
  -- expense entry removes this mirrored row too.
  expense_entry_id uuid references expense_entries(id) on delete cascade,
  -- Set when a payment was also recorded as a debit on a bank account.
  -- Plain uuid, not a foreign key — either side can be deleted first, and
  -- the API looks up and deletes the pair together (see bank_transactions
  -- .transfer_id for the same pattern between two bank accounts).
  bank_transaction_id uuid
);

create index if not exists idx_credit_cards_user on credit_cards(user_id);
create index if not exists idx_credit_card_transactions_card on credit_card_transactions(card_id, date desc);
create unique index if not exists idx_cct_expense_entry
  on credit_card_transactions(expense_entry_id) where expense_entry_id is not null;
create index if not exists idx_cct_bank_transaction
  on credit_card_transactions(bank_transaction_id) where bank_transaction_id is not null;

-- Back-reference from a bank_transactions row to the credit_card_transactions
-- row it was created to pay off. Plain uuid, not a foreign key — same
-- reasoning as bank_transaction_id above.
alter table bank_transactions
  add column if not exists credit_card_transaction_id uuid;

create index if not exists idx_bank_transactions_cc_payment
  on bank_transactions(credit_card_transaction_id) where credit_card_transaction_id is not null;
