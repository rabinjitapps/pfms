// Fetches and parses the AMFI NAVAll.txt feed.
// Format per line: Scheme Code;ISIN Div Payout;ISIN Div Reinvest;Scheme Name;Net Asset Value;Date
// Section headers (fund house names) and blank lines are skipped.

export interface AmfiNavRow {
  schemeCode: string;
  schemeName: string;
  nav: number;
  date: string; // ISO yyyy-mm-dd
}

const AMFI_URL = 'https://www.amfiindia.com/spages/NAVAll.txt';

function parseAmfiDate(raw: string): string | null {
  // AMFI date format: DD-Mon-YYYY, e.g. "17-Jun-2026"
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };
  const match = raw.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return null;
  const [, day, mon, year] = match;
  const month = months[mon];
  if (!month) return null;
  return `${year}-${month}-${day.padStart(2, '0')}`;
}

export async function fetchAllAmfiNavs(): Promise<AmfiNavRow[]> {
  const res = await fetch(AMFI_URL, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`AMFI fetch failed: ${res.status}`);
  }
  const text = await res.text();
  const lines = text.split('\n');
  const rows: AmfiNavRow[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Section headers don't have semicolons in this exact field count
    const parts = trimmed.split(';');
    if (parts.length < 6) continue;

    const [schemeCode, , , schemeName, navStr, dateStr] = parts;
    if (!schemeCode || schemeCode === 'Scheme Code') continue;

    const nav = parseFloat(navStr);
    const date = parseAmfiDate(dateStr);
    if (isNaN(nav) || !date) continue;

    rows.push({
      schemeCode: schemeCode.trim(),
      schemeName: schemeName.trim(),
      nav,
      date,
    });
  }

  return rows;
}

export async function fetchAmfiNavForScheme(schemeCode: string): Promise<AmfiNavRow | null> {
  const all = await fetchAllAmfiNavs();
  return all.find((r) => r.schemeCode === schemeCode) ?? null;
}

export async function searchAmfiSchemes(query: string, limit = 20): Promise<AmfiNavRow[]> {
  const all = await fetchAllAmfiNavs();
  const q = query.toLowerCase();
  return all.filter((r) => r.schemeName.toLowerCase().includes(q)).slice(0, limit);
}
