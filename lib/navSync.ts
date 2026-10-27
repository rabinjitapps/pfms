/**
 * Shared NAV sync used by both the manual "Refresh NAV" button and the cron
 * job. Looks each fund up in the AMFI feed first; anything AMFI can't supply
 * (feed unreachable, scheme missing from it) falls back to mfapi.in, so one
 * flaky source doesn't leave every fund stale.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { fetchAllAmfiNavs, AmfiNavRow } from '@/lib/amfi';
import { fetchLatestNavFromMfapi } from '@/lib/mfapi';

export interface FundToSync {
  id: string;
  name?: string | null;
  scheme_code: string | null;
}

export interface NavSyncResult {
  updated: number;
  total: number;        // funds that have a scheme code and were attempted
  skipped: number;      // funds with no scheme code (manual-only)
  failed: string[];     // names of funds no source could price
  viaAmfi: number;
  viaMfapi: number;
  amfiError: string | null;
}

async function writeNav(fundId: string, nav: number, date: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('funds')
    .update({ latest_nav: nav, latest_nav_date: date, updated_at: new Date().toISOString() })
    .eq('id', fundId);
  if (error) {
    console.error('Failed to update fund NAV:', fundId, error);
    return false;
  }

  await supabaseAdmin
    .from('nav_history')
    .upsert({ fund_id: fundId, date, nav }, { onConflict: 'fund_id,date' });
  return true;
}

export async function syncFundNavs(input: FundToSync[]): Promise<NavSyncResult> {
  // De-duplicate by fund id
  const byId = new Map<string, FundToSync>();
  for (const f of input) if (f && f.id) byId.set(f.id, f);
  const all = [...byId.values()];

  const funds = all.filter((f) => f.scheme_code && String(f.scheme_code).trim() !== '');
  const result: NavSyncResult = {
    updated: 0,
    total: funds.length,
    skipped: all.length - funds.length,
    failed: [],
    viaAmfi: 0,
    viaMfapi: 0,
    amfiError: null,
  };
  if (funds.length === 0) return result;

  let navByScheme = new Map<string, AmfiNavRow>();
  try {
    const rows = await fetchAllAmfiNavs();
    navByScheme = new Map(rows.map((r) => [r.schemeCode, r]));
  } catch (err) {
    result.amfiError = err instanceof Error ? err.message : String(err);
    console.error('AMFI feed unavailable, falling back to mfapi.in:', err);
  }

  const needFallback: FundToSync[] = [];

  for (const fund of funds) {
    const code = String(fund.scheme_code).trim();
    const row = navByScheme.get(code);
    if (row && (await writeNav(fund.id, row.nav, row.date))) {
      result.updated += 1;
      result.viaAmfi += 1;
    } else {
      needFallback.push(fund);
    }
  }

  // mfapi.in fallback, a few at a time to be polite
  const CHUNK = 5;
  for (let i = 0; i < needFallback.length; i += CHUNK) {
    const batch = needFallback.slice(i, i + CHUNK);
    await Promise.all(
      batch.map(async (fund) => {
        try {
          const latest = await fetchLatestNavFromMfapi(String(fund.scheme_code).trim());
          if (latest && (await writeNav(fund.id, latest.nav, latest.date))) {
            result.updated += 1;
            result.viaMfapi += 1;
            return;
          }
        } catch (err) {
          console.error('mfapi.in NAV fetch failed for', fund.scheme_code, err);
        }
        result.failed.push(fund.name || String(fund.scheme_code));
      })
    );
  }

  return result;
}
