import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { BulkImportRowError, TransactionType } from '@/types';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_ROWS = 1000;
const EPSILON = 0.0001;

interface ParsedRow {
  rowNumber: number; // 1-based Excel row, header is row 1
  date: string; // YYYY-MM-DD
  fundName: string;
  schemeCode: string | null;
  type: TransactionType;
  units: number | null;
  nav: number;
  amount: number | null;
  notes: string | null;
}

// Same date-cell handling as the expense bulk importer — xlsx (with
// cellDates: true) hands back date cells as JS Date objects whose UTC
// components match the spreadsheet's date, so reading them with UTC getters
// avoids a local-timezone day shift. Falls back to common text formats.
function parseDateCell(raw: unknown): string | null {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
    const d = String(raw.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  if (typeof raw === 'number' && isFinite(raw)) {
    // Excel's day 0 is 1899-12-30 (this also absorbs the spreadsheet
    // ecosystem's historical 1900-leap-year quirk, same as Excel itself).
    const ms = Date.UTC(1899, 11, 30) + Math.round(raw) * 86400000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return null;

    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) {
      const [, y, mo, d] = m;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (m) {
      const [, d, mo, y] = m;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    return null;
  }

  return null;
}

function parseType(raw: unknown): TransactionType | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (['buy', 'purchase', 'b'].includes(s)) return 'BUY';
  if (['sell', 'redeem', 'redemption', 's'].includes(s)) return 'SELL';
  return null;
}

function parseNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/[₹,\s]/g, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (!isNaN(n)) return n;
  }
  return null;
}

function isRowBlank(values: unknown[]): boolean {
  return values.every((v) => v === undefined || v === null || String(v).trim() === '');
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Could not read the uploaded file' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'File is too large — max 5MB' }, { status: 400 });
  }

  let workbook: XLSX.WorkBook;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch {
    return NextResponse.json(
      { error: 'Could not read this file — make sure it is a valid .xlsx or .xls file' },
      { status: 400 }
    );
  }

  const sheetName =
    workbook.SheetNames.find((n) => n.trim().toLowerCase() === 'template') ??
    workbook.SheetNames.find((n) => !/instruction|your funds|reference/i.test(n)) ??
    workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;

  if (!sheet) {
    return NextResponse.json({ error: 'The file has no readable sheet' }, { status: 400 });
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  if (rawRows.length === 0) {
    return NextResponse.json({ error: 'No data rows found in the file' }, { status: 400 });
  }
  if (rawRows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows — please limit a single upload to ${MAX_ROWS} rows` },
      { status: 400 }
    );
  }

  function pick(raw: Record<string, unknown>, ...keys: string[]): unknown {
    for (const k of keys) {
      if (raw[k] !== undefined) return raw[k];
    }
    return undefined;
  }

  const parsed: ParsedRow[] = [];
  const errors: BulkImportRowError[] = [];

  rawRows.forEach((raw, idx) => {
    const rowNumber = idx + 2; // +1 for header row, +1 for 0-index

    const dateRaw = pick(raw, 'Date', 'date');
    const fundNameRaw = pick(raw, 'Fund Name', 'Fund', 'fund_name', 'fund');
    const schemeCodeRaw = pick(raw, 'Scheme Code', 'SchemeCode', 'scheme_code');
    const typeRaw = pick(raw, 'Type', 'type');
    const unitsRaw = pick(raw, 'Units', 'units');
    const navRaw = pick(raw, 'NAV', 'Nav', 'nav');
    const amountRaw = pick(raw, 'Amount', 'amount');
    const notesRaw = pick(raw, 'Notes', 'notes');

    if (isRowBlank([dateRaw, fundNameRaw, schemeCodeRaw, typeRaw, unitsRaw, navRaw, amountRaw, notesRaw])) {
      return;
    }

    const date = parseDateCell(dateRaw);
    if (!date) {
      errors.push({ row: rowNumber, message: 'Date is missing or not in a recognizable format.' });
      return;
    }

    const fundName = String(fundNameRaw ?? '').trim();
    const schemeCode = String(schemeCodeRaw ?? '').trim() || null;
    if (!fundName && !schemeCode) {
      errors.push({ row: rowNumber, message: 'Fund Name (or Scheme Code) is required.' });
      return;
    }

    const type = parseType(typeRaw);
    if (!type) {
      errors.push({ row: rowNumber, message: 'Type must be "BUY" or "SELL".' });
      return;
    }

    const nav = parseNumber(navRaw);
    if (nav === null || nav <= 0) {
      errors.push({ row: rowNumber, message: 'NAV must be a number greater than zero.' });
      return;
    }

    let units = parseNumber(unitsRaw);
    let amount = parseNumber(amountRaw);

    if (units === null && amount === null) {
      errors.push({ row: rowNumber, message: 'Provide either Units or Amount.' });
      return;
    }
    if (units === null) {
      units = amount! / nav;
    }
    if (units <= 0) {
      errors.push({ row: rowNumber, message: 'Units must be a number greater than zero.' });
      return;
    }
    if (amount === null) {
      amount = units * nav;
    }

    const notes = String(notesRaw ?? '').trim() || null;

    parsed.push({
      rowNumber,
      date,
      fundName: fundName || schemeCode!,
      schemeCode,
      type,
      units,
      nav,
      amount: Math.round(amount * 100) / 100,
      notes,
    });
  });

  if (parsed.length === 0) {
    return NextResponse.json({ imported: 0, skipped: errors.length, errors, createdFunds: [] });
  }

  // ---- Resolve each row to a fund (existing or newly created) ----
  // Funds are shared across users, keyed primarily by AMFI scheme code.
  // Rows without a scheme code match by exact (case-insensitive) fund name.
  const fundCache = new Map<string, { id: string; isNew: boolean }>(); // key -> fund
  const createdFunds: string[] = [];

  function fundKey(row: ParsedRow): string {
    return row.schemeCode ? `code:${row.schemeCode}` : `name:${row.fundName.toLowerCase()}`;
  }

  for (const row of parsed) {
    const key = fundKey(row);
    if (fundCache.has(key)) continue;

    if (row.schemeCode) {
      const { data: existing } = await supabaseAdmin
        .from('funds')
        .select('id')
        .eq('scheme_code', row.schemeCode)
        .maybeSingle();

      if (existing) {
        fundCache.set(key, { id: existing.id, isNew: false });
        continue;
      }
    } else {
      const { data: existing } = await supabaseAdmin
        .from('funds')
        .select('id, name')
        .ilike('name', row.fundName)
        .maybeSingle();

      if (existing) {
        fundCache.set(key, { id: existing.id, isNew: false });
        continue;
      }
    }

    const { data: created, error: createErr } = await supabaseAdmin
      .from('funds')
      .insert({
        scheme_code: row.schemeCode,
        name: row.fundName,
        latest_nav: row.nav,
        latest_nav_date: row.date,
      })
      .select('id')
      .single();

    if (createErr || !created) {
      console.error('Failed to auto-create fund during bulk import:', createErr);
      errors.push({ row: row.rowNumber, message: `Could not create fund "${row.fundName}".` });
      continue;
    }

    fundCache.set(key, { id: created.id, isNew: true });
    createdFunds.push(row.fundName);
  }

  // ---- Resolve/create the user's holding for each fund ----
  const holdingCache = new Map<string, string>(); // fund id -> holding id

  async function getHoldingId(fundId: string): Promise<string | null> {
    if (holdingCache.has(fundId)) return holdingCache.get(fundId)!;

    const { data: existing } = await supabaseAdmin
      .from('holdings')
      .select('id')
      .eq('user_id', userId)
      .eq('fund_id', fundId)
      .maybeSingle();

    if (existing) {
      holdingCache.set(fundId, existing.id);
      return existing.id;
    }

    const { data: created, error } = await supabaseAdmin
      .from('holdings')
      .insert({ user_id: userId, fund_id: fundId })
      .select('id')
      .single();

    if (error || !created) {
      console.error('Failed to auto-create holding during bulk import:', error);
      return null;
    }

    holdingCache.set(fundId, created.id);
    return created.id;
  }

  // ---- Track running held units per holding, seeded from existing transactions ----
  const heldUnits = new Map<string, number>(); // holding id -> units held so far

  async function seedHeldUnits(holdingId: string) {
    if (heldUnits.has(holdingId)) return;
    const { data: existingTxns } = await supabaseAdmin
      .from('transactions')
      .select('type, units')
      .eq('holding_id', holdingId);

    const total = (existingTxns ?? []).reduce(
      (sum, t) => sum + (t.type === 'BUY' ? Number(t.units) : -Number(t.units)),
      0
    );
    heldUnits.set(holdingId, total);
  }

  const rowsToInsert: {
    holding_id: string;
    type: TransactionType;
    date: string;
    units: number;
    nav: number;
    amount: number;
    notes: string | null;
  }[] = [];

  for (const row of parsed) {
    const fund = fundCache.get(fundKey(row));
    if (!fund) continue; // fund creation failed, error already recorded

    const holdingId = await getHoldingId(fund.id);
    if (!holdingId) {
      errors.push({ row: row.rowNumber, message: 'Could not create or find a holding for this fund.' });
      continue;
    }

    await seedHeldUnits(holdingId);
    const current = heldUnits.get(holdingId) ?? 0;

    if (row.type === 'SELL' && row.units! > current + EPSILON) {
      errors.push({
        row: row.rowNumber,
        message:
          current > EPSILON
            ? `Only ${current.toFixed(4)} units available to sell for "${row.fundName}" at this point — cannot sell ${row.units!.toFixed(4)}.`
            : `No units held yet for "${row.fundName}" to sell.`,
      });
      continue;
    }

    heldUnits.set(holdingId, row.type === 'BUY' ? current + row.units! : current - row.units!);

    rowsToInsert.push({
      holding_id: holdingId,
      type: row.type,
      date: row.date,
      units: row.units!,
      nav: row.nav,
      amount: row.amount!,
      notes: row.notes,
    });
  }

  let imported = 0;
  if (rowsToInsert.length > 0) {
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('transactions')
      .insert(rowsToInsert)
      .select('id');

    if (insertErr) {
      console.error('Failed to bulk insert transactions:', insertErr);
      return NextResponse.json({ error: 'Failed to save transactions' }, { status: 500 });
    }
    imported = inserted?.length ?? 0;
  }

  return NextResponse.json({
    imported,
    skipped: errors.length,
    errors,
    createdFunds,
  });
}
