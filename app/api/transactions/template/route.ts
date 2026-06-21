import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';

// Generates a fresh .xlsx template on every request, rather than serving a
// static file, so the "Your funds" sheet always reflects the current user's
// actual holdings (new funds still get auto-created on import, but seeing
// the existing list up front helps avoid accidental near-duplicates like
// "HDFC Balanced Advantage Fund" vs "HDFC Balanced Advantage Fund - Growth").
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: holdings } = await supabaseAdmin
    .from('holdings')
    .select('fund:funds(name, scheme_code, latest_nav)')
    .eq('user_id', userId);

  type FundRef = { name: string; scheme_code: string | null; latest_nav: number | null };
  const funds: FundRef[] = ((holdings ?? []) as unknown as { fund: FundRef }[])
    .map((h) => h.fund)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  const wb = XLSX.utils.book_new();

  const instructionsRows: (string | number)[][] = [
    ['Bulk fund investment upload — instructions'],
    [],
    ['1. Fill in the "Template" sheet below — one row per BUY/SELL transaction. Don\'t rename the column headers.'],
    ['2. Date: YYYY-MM-DD is safest (e.g. 2026-06-15). DD-MM-YYYY also works.'],
    ['3. Fund Name: the mutual fund this transaction belongs to.'],
    ['   See the "Your funds" sheet for funds you already hold, to reuse exact spelling.'],
    ["   Funds that don't already exist yet are created automatically on upload."],
    ['4. Scheme Code: optional AMFI scheme code. If it matches an existing fund, that fund is used'],
    ['   regardless of how Fund Name is spelled. Leave blank for manually-tracked funds.'],
    ['5. Type: exactly "BUY" or "SELL".'],
    ['6. Units: number of units transacted. Leave blank if you fill in Amount instead — units will'],
    ['   be calculated as Amount ÷ NAV.'],
    ['7. NAV: price per unit on the transaction date. Always required.'],
    ['8. Amount: optional. If left blank, it is calculated as Units × NAV.'],
    ['9. Notes: optional, free text.'],
    ['10. For SELL rows, keep rows in chronological (date) order per fund — each sell is checked'],
    ['    against units already bought for that fund so far in the upload plus units you already held.'],
    ['11. Leave a row completely blank and it will be skipped, not flagged as an error.'],
    [],
    ['When done, save the file and upload it from the dashboard → Bulk import.'],
  ];
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsRows);
  wsInstructions['!cols'] = [{ wch: 92 }];
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

  const templateRows: (string | number)[][] = [
    ['Date', 'Fund Name', 'Scheme Code', 'Type', 'Units', 'NAV', 'Amount', 'Notes'],
    ['2026-06-01', 'HDFC Balanced Advantage Fund - Growth Plan - Direct Plan', '119551', 'BUY', 17.7013, 564.71, '', 'June SIP'],
    ['2026-06-05', 'Motilal Oswal Midcap Fund-Direct Plan-Growth Option', '125497', 'BUY', '', 109.03, 5000, ''],
    ['2026-06-10', 'HDFC Balanced Advantage Fund - Growth Plan - Direct Plan', '119551', 'SELL', 5, 570.2, '', 'Partial redemption'],
  ];
  const wsTemplate = XLSX.utils.aoa_to_sheet(templateRows);
  wsTemplate['!cols'] = [
    { wch: 12 },
    { wch: 42 },
    { wch: 14 },
    { wch: 8 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template');

  const fundsRows: (string | number)[][] = [['Fund Name', 'Scheme Code', 'Latest NAV']];
  for (const f of funds) {
    fundsRows.push([f.name, f.scheme_code ?? '', f.latest_nav ?? '']);
  }
  if (funds.length === 0) fundsRows.push(['(no funds yet)', '', '']);
  const wsFunds = XLSX.utils.aoa_to_sheet(fundsRows);
  wsFunds['!cols'] = [{ wch: 48 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsFunds, 'Your funds');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="fund-bulk-upload-template.xlsx"',
    },
  });
}
