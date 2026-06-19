-- Mutual Fund Tracker schema
-- Run this in the Supabase SQL editor

create extension if not exists "uuid-ossp";

-- Users (simple username/password auth, multi-user)
create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  username text unique not null,
  password_hash text not null,
  display_name text,
  created_at timestamptz default now()
);

-- Master list of mutual funds (shared across users, identified by AMFI scheme code)
create table if not exists funds (
  id uuid primary key default uuid_generate_v4(),
  scheme_code text unique,          -- AMFI scheme code, e.g. "119551". Null allowed for manual-only funds.
  name text not null,
  fund_house text,
  category text,                    -- e.g. "Equity - Large Cap", "Debt - Liquid"
  latest_nav numeric(12,4),
  latest_nav_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- A user's holding in a specific fund (aggregated position)
create table if not exists holdings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  fund_id uuid not null references funds(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, fund_id)
);

-- Individual transactions (buy/sell/switch) — source of truth for units & invested amount
create table if not exists transactions (
  id uuid primary key default uuid_generate_v4(),
  holding_id uuid not null references holdings(id) on delete cascade,
  type text not null check (type in ('BUY', 'SELL')),
  date date not null,
  units numeric(16,4) not null check (units > 0),
  nav numeric(12,4) not null check (nav > 0),
  amount numeric(14,2) not null,     -- units * nav at transaction time (stored to survive NAV edits)
  notes text,
  created_at timestamptz default now()
);

-- NAV history (optional, populated by auto-fetch so charts/history are possible later)
create table if not exists nav_history (
  id uuid primary key default uuid_generate_v4(),
  fund_id uuid not null references funds(id) on delete cascade,
  date date not null,
  nav numeric(12,4) not null,
  unique (fund_id, date)
);

create index if not exists idx_transactions_holding on transactions(holding_id);
create index if not exists idx_holdings_user on holdings(user_id);
create index if not exists idx_nav_history_fund on nav_history(fund_id, date desc);
