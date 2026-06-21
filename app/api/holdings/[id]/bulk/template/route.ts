import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { BulkImportRowError, TransactionType } from '@/types';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_ROWS = 1000;
const EPSILON = 0.0001;

interface ParsedRow {
  rowNumber: number;
  date: string;
  type: TransactionType;
  units: number;
  nav: number;
  amount: number;
  notes: string | null;
}

function parseDateCell(raw: unknown): string | null {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
    const d = String(raw.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  if (typeof raw === 'number' && isFinite(raw)) {
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: holdingId } = await params;

  const { data: holding } = await supabaseAdmin
    .from('holdings')
    .select('id, user_id')
    .eq('id', holdingId)
    .maybeSingle();

  if (!holding || holding.user_id !== userId) {
    return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
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
    workbook.SheetNames.find((n) => !/instruction|reference/i.test(n)) ??
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
    const rowNumber = idx + 2;

    const dateRaw = pick(raw, 'Date', 'date');
    const typeRaw = pick(raw, 'Type', 'type');
    const unitsRaw = pick(raw, 'Units', 'units');
    const navRaw = pick(raw, 'NAV', 'Nav', 'nav');
    const amountRaw = pick(raw, 'Amount', 'amount');
    const notesRaw = pick(raw, 'Notes', 'notes');

    if (isRowBlank([dateRaw, typeRaw, unitsRaw, navRaw, amountRaw, notesRaw])) return;

    const date = parseDateCell(dateRaw);
    if (!date) {
      errors.push({ row: rowNumber, message: 'Date is missing or not in a recognizable format.' });
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
      type,
      units,
      nav,
      amount: Math.round(amount * 100) / 100,
      notes,
    });
  });

  if (parsed.length === 0) {
    return NextResponse.json({ imported: 0, skipped: errors.length, errors });
  }

  // Seed the running unit balance from existing transactions, then walk the
  // sheet in order so SELL rows are checked against what's actually
  // available at that point (existing holdings + earlier rows in this file).
  const { data: existingTxns } = await supabaseAdmin
    .from('transactions')
    .select('type, units')
    .eq('holding_id', holdingId);

  let heldUnits = (existingTxns ?? []).reduce(
    (sum, t) => sum + (t.type === 'BUY' ? Number(t.units) : -Number(t.units)),
    0
  );

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
    if (row.type === 'SELL' && row.units > heldUnits + EPSILON) {
      errors.push({
        row: row.rowNumber,
        message:
          heldUnits > EPSILON
            ? `Only ${heldUnits.toFixed(4)} units available to sell at this point — cannot sell ${row.units.toFixed(4)}.`
            : 'No units held yet to sell.',
      });
      continue;
    }

    heldUnits = row.type === 'BUY' ? heldUnits + row.units : heldUnits - row.units;

    rowsToInsert.push({
      holding_id: holdingId,
      type: row.type,
      date: row.date,
      units: row.units,
      nav: row.nav,
      amount: row.amount,
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
      console.error('Failed to bulk insert transactions for holding:', insertErr);
      return NextResponse.json({ error: 'Failed to save transactions' }, { status: 500 });
    }
    imported = inserted?.length ?? 0;
  }

  return NextResponse.json({
    imported,
    skipped: errors.length,
    errors,
  });
}
