// Fetches historical NAV for a fund on (or just before) a given date, via mfapi.in,
// which mirrors AMFI's daily NAV history. Used so transaction entry can auto-fill NAV
// once a date and a fund are chosen, instead of the user looking it up by hand.

export interface MfapiNavPoint {
  date: string; // DD-MM-YYYY as returned by mfapi.in
  nav: string;
}

interface MfapiSchemeResponse {
  meta: {
    scheme_code: number;
    scheme_name: string;
  };
  data: MfapiNavPoint[];
  status: string;
}

function toIsoDate(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('-');
  return `${y}-${m}-${d}`;
}

/**
 * Returns the NAV on `targetDate` (yyyy-mm-dd) for the given AMFI scheme code,
 * falling back to the most recent prior trading day if the market was closed
 * (weekend/holiday) on the exact date. Returns null if no data is found at all,
 * e.g. the date is before the fund existed.
 */
export async function fetchNavOnDate(
  schemeCode: string,
  targetDate: string
): Promise<{ nav: number; date: string } | null> {
  const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`mfapi.in fetch failed: ${res.status}`);
  }
  const json = (await res.json()) as MfapiSchemeResponse;
  if (json.status !== 'SUCCESS' || !Array.isArray(json.data) || json.data.length === 0) {
    return null;
  }

  const target = new Date(targetDate).getTime();

  // mfapi.in returns data newest-first; find the first entry whose date <= target
  let best: MfapiNavPoint | null = null;
  for (const point of json.data) {
    const pointTime = new Date(toIsoDate(point.date)).getTime();
    if (pointTime <= target) {
      best = point;
      break;
    }
  }

  // If every entry is after the target date (e.g. fund launched after target),
  // there's nothing valid to use.
  if (!best) return null;

  const nav = parseFloat(best.nav);
  if (isNaN(nav)) return null;

  return { nav, date: toIsoDate(best.date) };
}
