# Ledger — Mutual Fund Tracker

A simple multi-user app for tracking mutual fund holdings: units, buy/sell transactions, NAV, and gains/losses. Built with Next.js (App Router) + TypeScript on the frontend, Supabase on the backend, deployed on Vercel.

## Features

- **Multi-user**, username + password auth (NextAuth, credentials provider, bcrypt hashing)
- **Add funds** by searching the live AMFI scheme list, or enter a fund manually (e.g. a PF/NPS-style holding with no AMFI code)
- **Transaction history** — record BUY/SELL transactions; units, invested amount, and average NAV are derived from the transaction log, not stored as a flat number
- **NAV auto-fetch** from the official AMFI NAVAll.txt feed, on demand (button in the UI) or daily via a Vercel Cron job
- **Manual NAV override** for funds you'd rather not auto-fetch
- Portfolio summary: current value, invested amount, gain/loss (₹ and %)

## Stack

- Next.js 16 (App Router, Turbopack)
- TypeScript
- Supabase (Postgres) — service-role key used server-side only, in API routes
- NextAuth (JWT sessions, credentials provider)
- Plain inline styles (no Tailwind) — same pattern as other NLUT-style projects in this workspace

## Setup

### 1. Supabase

Create a new Supabase project, then run `schema.sql` in the SQL editor. It creates: `users`, `funds`, `holdings`, `transactions`, `nav_history`.

### 2. Environment variables

Copy `.env.local.example` to `.env.local` and fill in:

```
SUPABASE_URL=                  # Project URL
SUPABASE_SERVICE_ROLE_KEY=     # Service role key (Settings → API). Server-side only, never exposed to the client.
NEXTAUTH_SECRET=               # openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
CRON_SECRET=                   # any random string; protects the auto-NAV-refresh endpoint
```

On Vercel, add the same variables under Project Settings → Environment Variables, and set `NEXTAUTH_URL` to your deployed URL.

### 3. Run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`, you'll be redirected to `/login`. Use "Create an account" to register the first user.

### 4. Deploy

Push to GitHub and import into Vercel. `vercel.json` already configures a daily cron (18:00 UTC, ~11:30 PM IST) hitting `/api/cron/refresh-nav` to keep NAVs fresh automatically — Vercel sends the `CRON_SECRET` as a bearer token automatically when the env var is set.

## How the numbers work

- Each holding's units and invested amount are derived from its transaction log (average-cost method): `invested = held units × average buy NAV`.
- Current value = held units × the fund's `latest_nav`.
- `latest_nav` is updated either by the "Refresh NAVs" button (fetches AMFI for funds you currently hold), the daily cron (refreshes all AMFI-linked funds system-wide), or a manual NAV entry per fund.
- Manually-added funds (no AMFI scheme code) are never touched by auto-refresh — only manual NAV updates apply to them.

## Project structure

```
app/
  page.tsx                 server component: checks session, renders Dashboard
  login/, register/        auth pages
  api/
    auth/[...nextauth]     NextAuth handler
    register                 create account
    holdings                 list portfolio / add a fund+holding
    holdings/[id]             delete a holding
    transactions              record a BUY/SELL
    transactions/[id]         delete a transaction
    funds/search               AMFI scheme search (for Add Fund modal)
    funds/update-nav            manual NAV override
    funds/refresh-nav            on-demand NAV refresh (current user's funds)
    cron/refresh-nav              daily refresh for ALL AMFI-linked funds (Vercel Cron)
components/
  Dashboard.tsx             portfolio summary + holdings list
  AddHoldingModal.tsx       AMFI search / manual fund entry
  TransactionModal.tsx      record transactions, manual NAV update, history
lib/
  supabase.ts               service-role Supabase client (server-only)
  auth.ts                    NextAuth config
  session.ts                 getCurrentUserId() helper for API routes
  amfi.ts                     AMFI NAVAll.txt fetch + parse
schema.sql                  run this in Supabase SQL editor
vercel.json                 cron config
```
