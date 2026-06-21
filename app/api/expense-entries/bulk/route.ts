import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { BulkImportResult, BulkImportRowError, ExpenseCategoryKind, ExpenseDirection } from '@/types';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_ROWS = 1000;

interface ParsedRow {
  rowNumber: number; // 1-based Excel row, header is row 1
  date: string; // YYYY-MM-DD
  direction: ExpenseDirection;
  kind: ExpenseCategoryKind;
  headName: string;
  amount: number;
  notes: string | null;
}

// xlsx (with cellDates: true) hands back date cells as JS Date objects whose
// UTC components match the spreadsheet's date — reading them with the UTC
// getters avoids a local-timezone day shift. Falls back to parsing common
// text formats for cells typed in as plain strings.
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

    // YYYY-MM-DD or YYYY/MM/DD
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) {
      const [, y, mo, d] = m;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // DD-MM-YYYY or DD/MM/YYYY
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (m) {
      const [, d, mo, y] = m;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    return null;
  }

  return null;
}

function parseDirection(raw: unknown): ExpenseDirection | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (['income', 'in', 'inflow', 'credit'].includes(s)) return 'INFLOW';
  if (['expense', 'out', 'outflow', 'debit'].includes(s)) return 'OUTFLOW';
  return null;
}

function parseAmount(raw: unknown): number | null {
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

  // Prefer a sheet literally named "Template" (matches the downloadable
  // template), otherwise the first sheet that doesn't look like the
  // instructions/reference sheets, otherwise just the first sheet.
  const sheetName =
    workbook.SheetNames.find((n) => n.trim().toLowerCase() === 'template') ??
    workbook.SheetNames.find((n) => !/instruction|your heads|reference/i.test(n)) ??
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
    const typeRaw = pick(raw, 'Type', 'type');
    const headRaw = pick(raw, 'Head', 'head', 'Category', 'category');
    const amountRaw = pick(raw, 'Amount', 'amount');
    const notesRaw = pick(raw, 'Notes', 'notes');

    if (isRowBlank([dateRaw, typeRaw, headRaw, amountRaw, notesRaw])) return;

    const date = parseDateCell(dateRaw);
    if (!date) {
      errors.push({ row: rowNumber, message: 'Date is missing or not in a recognizable format.' });
      return;
    }

    const direction = parseDirection(typeRaw);
    if (!direction) {
      errors.push({ row: rowNumber, message: 'Type must be "Income" or "Expense".' });
      return;
    }

    const headName = String(headRaw ?? '').trim();
    if (!headName) {
      errors.push({ row: rowNumber, message: 'Head is required.' });
      return;
    }

    const amount = parseAmount(amountRaw);
    if (amount === null || amount <= 0) {
      errors.push({ row: rowNumber, message: 'Amount must be a number greater than zero.' });
      return;
    }

    const notes = String(notesRaw ?? '').trim() || null;

    parsed.push({
      rowNumber,
      date,
      direction,
      kind: direction === 'INFLOW' ? 'INCOME' : 'EXPENSE',
      headName,
      amount: Math.round(amount * 100) / 100,
      notes,
    });
  });

  if (parsed.length === 0) {
    const result: BulkImportResult = { imported: 0, skipped: errors.length, errors, createdHeads: [] };
    return NextResponse.json(result);
  }

  // Load this user's existing heads once, then create any new ones
  // encountered in the sheet — same idempotent "create on the fly" pattern
  // already used by the single-entry add flow.
  const { data: existingCategories, error: catErr } = await supabaseAdmin
    .from('expense_categories')
    .select('id, name, kind')
    .eq('user_id', userId);

  if (catErr) {
    console.error('Failed to load expense categories for bulk import:', catErr);
    return NextResponse.json({ error: 'Could not load heads' }, { status: 500 });
  }

  const headKey = (kind: ExpenseCategoryKind, name: string) => `${kind}::${name.toLowerCase()}`;
  const headMap = new Map<string, string>(); // headKey -> category id
  for (const c of existingCategories ?? []) {
    headMap.set(headKey(c.kind as ExpenseCategoryKind, c.name), c.id);
  }

  const createdHeads: string[] = [];

  for (const row of parsed) {
    const key = headKey(row.kind, row.headName);
    if (headMap.has(key)) continue;

    const { data: created, error } = await supabaseAdmin
      .from('expense_categories')
      .insert({ user_id: userId, name: row.headName, kind: row.kind })
      .select('id')
      .single();

    if (error || !created) {
      console.error('Failed to auto-create head during bulk import:', error);
      errors.push({ row: row.rowNumber, message: `Could not create head "${row.headName}".` });
      continue;
    }

    headMap.set(key, created.id);
    createdHeads.push(row.headName);
  }

  const rowsToInsert = parsed
    .filter((row) => headMap.has(headKey(row.kind, row.headName)))
    .map((row) => ({
      user_id: userId,
      category_id: headMap.get(headKey(row.kind, row.headName))!,
      direction: row.direction,
      date: row.date,
      amount: row.amount,
      notes: row.notes,
    }));

  let imported = 0;
  if (rowsToInsert.length > 0) {
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('expense_entries')
      .insert(rowsToInsert)
      .select('id');

    if (insertErr) {
      console.error('Failed to bulk insert expense entries:', insertErr);
      return NextResponse.json({ error: 'Failed to save entries' }, { status: 500 });
    }
    imported = inserted?.length ?? 0;
  }

  const result: BulkImportResult = {
    imported,
    skipped: errors.length,
    errors,
    createdHeads,
  };
  return NextResponse.json(result);
}
