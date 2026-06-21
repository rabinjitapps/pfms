import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';

// Generates a fresh .xlsx template on every request, rather than serving a
// static file, so the "Your heads" sheet always reflects the current user's
// actual heads (new heads still get auto-created on import, but seeing the
// existing list up front helps avoid accidental near-duplicates like
// "Grocery" vs "Groceries").
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: categories } = await supabaseAdmin
    .from('expense_categories')
    .select('name, kind')
    .eq('user_id', userId)
    .order('name', { ascending: true });

  const incomeHeads = (categories ?? []).filter((c) => c.kind === 'INCOME').map((c) => c.name);
  const expenseHeads = (categories ?? []).filter((c) => c.kind === 'EXPENSE').map((c) => c.name);

  const wb = XLSX.utils.book_new();

  const instructionsRows: (string | number)[][] = [
    ['Bulk expense upload — instructions'],
    [],
    ['1. Fill in the "Template" sheet below — one row per entry. Don\'t rename the column headers.'],
    ['2. Date: YYYY-MM-DD is safest (e.g. 2026-06-15). DD-MM-YYYY also works.'],
    ['3. Type: exactly "Income" or "Expense".'],
    ['4. Head: the income/expense head this entry belongs to.'],
    ["   Heads that don't already exist yet are created automatically on upload."],
    ['   See the "Your heads" sheet for heads you already have, to reuse spelling.'],
    ['5. Amount: a plain number greater than zero — no currency symbol or commas.'],
    ['6. Notes: optional, free text.'],
    ['7. Leave a row completely blank and it will be skipped, not flagged as an error.'],
    [],
    ['When done, save the file and upload it from Expenses → Bulk import.'],
  ];
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsRows);
  wsInstructions['!cols'] = [{ wch: 78 }];
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

  const templateRows: (string | number)[][] = [
    ['Date', 'Type', 'Head', 'Amount', 'Notes'],
    ['2026-06-01', 'Income', 'Salary', 75000, 'June salary'],
    ['2026-06-03', 'Expense', 'Groceries', 2450.5, 'Weekly grocery run'],
    ['2026-06-05', 'Expense', 'Rent', 18000, ''],
  ];
  const wsTemplate = XLSX.utils.aoa_to_sheet(templateRows);
  wsTemplate['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template');

  const headsRows: string[][] = [['Income heads', 'Expense heads']];
  const maxLen = Math.max(incomeHeads.length, expenseHeads.length, 1);
  for (let i = 0; i < maxLen; i++) {
    headsRows.push([incomeHeads[i] ?? '', expenseHeads[i] ?? '']);
  }
  const wsHeads = XLSX.utils.aoa_to_sheet(headsRows);
  wsHeads['!cols'] = [{ wch: 26 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(wb, wsHeads, 'Your heads');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="expense-bulk-upload-template.xlsx"',
    },
  });
}
