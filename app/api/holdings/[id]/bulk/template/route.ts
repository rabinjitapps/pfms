import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';

// Fund-scoped template: the fund is already known (this is opened from
// inside that fund's own modal), so the sheet only needs Date / Type /
// Units / NAV / Amount / Notes — no Fund Name or Scheme Code columns to
// get wrong.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { data: holding } = await supabaseAdmin
    .from('holdings')
    .select('id, user_id, fund:funds(name, scheme_code, latest_nav)')
    .eq('id', id)
    .maybeSingle();

  type FundRef = { name: string; scheme_code: string | null; latest_nav: number | null };
  const fund = (holding as unknown as { user_id: string; fund: FundRef } | null)?.fund;

  if (!holding || (holding as { user_id: string }).user_id !== userId || !fund) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const wb = XLSX.utils.book_new();

  const instructionsRows: (string | number)[][] = [
    [`Bulk upload for: ${fund.name}`],
    fund.scheme_code ? [`AMFI scheme code: ${fund.scheme_code}`] : [],
    [],
    ['1. Fill in the "Template" sheet below — one row per BUY/SELL transaction for this fund only.'],
    ["   Don't rename the column headers."],
    ['2. Date: YYYY-MM-DD is safest (e.g. 2026-06-15). DD-MM-YYYY also works.'],
    ['3. Type: exactly "BUY" or "SELL".'],
    ['4. Units: number of units transacted. Leave blank if you fill in Amount instead — units will'],
    ['   be calculated as Amount ÷ NAV.'],
    ['5. NAV: price per unit on the transaction date. Always required.'],
    ['6. Amount: optional. If left blank, it is calculated as Units × NAV.'],
    ['7. Notes: optional, free text.'],
    ['8. For SELL rows, keep rows in chronological (date) order — each sell is checked against'],
    ['   units already bought so far (your existing holdings plus earlier rows in this upload).'],
    ['9. Leave a row completely blank and it will be skipped, not flagged as an error.'],
    [],
    ['When done, save the file and upload it from this fund → Bulk import.'],
  ].filter((r) => r.length > 0 || true) as (string | number)[][];
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsRows);
  wsInstructions['!cols'] = [{ wch: 92 }];
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

  const currentNav = fund.latest_nav ?? 100;
  const templateRows: (string | number)[][] = [
    ['Date', 'Type', 'Units', 'NAV', 'Amount', 'Notes'],
    ['2026-06-01', 'BUY', '', currentNav, 5000, 'June SIP'],
    ['2026-07-01', 'BUY', '', currentNav, 5000, 'July SIP'],
    ['2026-07-15', 'SELL', 5, currentNav, '', 'Partial redemption'],
  ];
  const wsTemplate = XLSX.utils.aoa_to_sheet(templateRows);
  wsTemplate['!cols'] = [
    { wch: 12 },
    { wch: 8 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const safeName = fund.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safeName}-bulk-upload-template.xlsx"`,
    },
  });
}
