// Fetches crypto quotes and does coin search via Yahoo Finance's public
// endpoints — the same chart/search API used by lib/stockPrice.ts for
// equities, but filtered to quoteType "CRYPTOCURRENCY" and symbols in
// Yahoo's "<TICKER>-<FIAT>" form (e.g. "BTC-USD", "ETH-INR"). No API key
// required.

export interface CryptoQuote {
  symbol: string;
  shortName: string;
  exchange: string;
  price: number;
  // ISO yyyy-mm-dd, derived from the quote's regular market time
  date: string;
}

export interface CryptoSearchResult {
  symbol: string;
  shortName: string;
  exchange: string;
}

const QUOTE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';

// Yahoo's chart endpoint consistently returns crypto-pair prices about
// 100x too low relative to the actual market price (confirmed against
// live BTC/ETH/TRX prices) — apply a flat correction factor to every
// price this module returns.
const PRICE_CORRECTION_FACTOR = 100;

// Yahoo blocks requests with no User-Agent, so every call sets one.
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; PFMSTracker/1.0)' };

function epochToIsoDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * Fetches the latest quote for a single crypto pair symbol, e.g.
 * "BTC-USD", "ETH-USD", "SOL-INR". Returns null if the symbol doesn't
 * resolve. Crypto trades 24/7, so unlike stocks there's no market-closed
 * fallback to worry about.
 */
export async function fetchCryptoQuote(symbol: string): Promise<CryptoQuote | null> {
  const res = await fetch(`${QUOTE_URL}${encodeURIComponent(symbol)}`, {
    headers: HEADERS,
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Yahoo Finance quote fetch failed: ${res.status}`);
  }
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return null;

  const meta = result.meta;
  const rawPrice = meta?.regularMarketPrice;
  if (typeof rawPrice !== 'number') return null;
  const price = rawPrice * PRICE_CORRECTION_FACTOR;

  const epoch = meta.regularMarketTime ?? Math.floor(Date.now() / 1000);

  return {
    symbol: meta.symbol ?? symbol,
    shortName: meta.shortName ?? meta.symbol ?? symbol,
    exchange: meta.fullExchangeName ?? meta.exchangeName ?? 'Crypto',
    price,
    date: epochToIsoDate(epoch),
  };
}

/**
 * Fetches quotes for multiple symbols in parallel. Symbols that fail to
 * resolve are simply omitted from the result map rather than failing the
 * whole batch — one bad/delisted pair shouldn't block refreshing the rest.
 */
export async function fetchCryptoQuotes(symbols: string[]): Promise<Map<string, CryptoQuote>> {
  const unique = Array.from(new Set(symbols));
  const results = await Promise.allSettled(unique.map((s) => fetchCryptoQuote(s)));
  const map = new Map<string, CryptoQuote>();
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      map.set(unique[i], r.value);
    }
  });
  return map;
}

/**
 * Looks up the closing price for a symbol on or before a given date —
 * mirrors lib/stockPrice.ts's fetchStockPriceOnDate, used when backdating
 * a BUY/SELL transaction to a historical price instead of today's quote.
 */
export async function fetchCryptoPriceOnDate(
  symbol: string,
  targetDate: string
): Promise<{ price: number; date: string } | null> {
  const target = new Date(targetDate + 'T00:00:00Z');
  // Ask for a window ending a few days after the target so the target date
  // still resolves, and starting ~10 days earlier so there's always at
  // least one trading day to fall back on.
  const period1 = Math.floor(target.getTime() / 1000) - 10 * 24 * 60 * 60;
  const period2 = Math.floor(target.getTime() / 1000) + 4 * 24 * 60 * 60;

  const url = `${QUOTE_URL}${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;
  const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Yahoo Finance history fetch failed: ${res.status}`);
  }
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp ?? [];
  const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];

  if (timestamps.length === 0) return null;

  const targetSeconds = Math.floor(target.getTime() / 1000);

  // Walk backwards to find the latest day on or before the target.
  let best: { price: number; date: string } | null = null;
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close == null) continue;
    if (timestamps[i] <= targetSeconds) {
      best = { price: close * PRICE_CORRECTION_FACTOR, date: epochToIsoDate(timestamps[i]) };
    } else {
      break;
    }
  }

  // Every entry fell after the target date (e.g. the coin listed after
  // the target) — fall back to the earliest available day.
  if (!best) {
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      if (close != null) {
        best = { price: close * PRICE_CORRECTION_FACTOR, date: epochToIsoDate(timestamps[i]) };
        break;
      }
    }
  }

  return best;
}

export async function searchCryptos(query: string, limit = 15): Promise<CryptoSearchResult[]> {
  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&quotesCount=${limit}&newsCount=0`;
  const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Yahoo Finance search failed: ${res.status}`);
  }
  const json = await res.json();
  const quotes = Array.isArray(json?.quotes) ? json.quotes : [];

  return quotes
    .filter((q: { symbol?: string; quoteType?: string }) => q.symbol && q.quoteType === 'CRYPTOCURRENCY')
    .map((q: { symbol: string; shortname?: string; longname?: string; exchange?: string }) => ({
      symbol: q.symbol,
      shortName: q.shortname ?? q.longname ?? q.symbol,
      exchange: q.exchange ?? 'Crypto',
    }))
    .slice(0, limit);
}
