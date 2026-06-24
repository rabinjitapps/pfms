/**
 * Generic, client-side "export what's on screen" helpers for the Reports
 * page. Each report tab builds its own rows + column definitions from the
 * currently filtered/grouped data, then hands them to one of these — so the
 * downloaded file always matches exactly what's shown in the table.
 */
'use client';

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ReportColumn<T> {
  key: keyof T;
  label: string;
  // Optional formatter for display/export (e.g. currency, date formatting).
  // Falls back to String(value) when omitted.
  format?: (row: T) => string;
  align?: 'left' | 'right';
}

function cellValue<T>(row: T, col: ReportColumn<T>): string {
  if (col.format) return col.format(row);
  const v = row[col.key];
  return v === null || v === undefined ? '' : String(v);
}

export function exportReportToExcel<T>(
  rows: T[],
  columns: ReportColumn<T>[],
  filename: string,
  sheetName = 'Report'
): void {
  const header = columns.map((c) => c.label);
  const body = rows.map((row) => columns.map((c) => cellValue(row, c)));
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(c.label.length + 2, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerDownload(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function exportReportToPdf<T>(
  rows: T[],
  columns: ReportColumn<T>[],
  filename: string,
  title: string
): void {
  const doc = new jsPDF({ orientation: columns.length > 5 ? 'landscape' : 'portrait' });
  doc.setFontSize(14);
  doc.text(title, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`, 14, 21);

  autoTable(doc, {
    startY: 26,
    head: [columns.map((c) => c.label)],
    body: rows.map((row) => columns.map((c) => cellValue(row, c))),
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [31, 77, 58], textColor: 255 },
    columnStyles: columns.reduce((acc, c, i) => {
      if (c.align === 'right') acc[i] = { halign: 'right' };
      return acc;
    }, {} as Record<number, { halign: 'right' }>),
  });

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
