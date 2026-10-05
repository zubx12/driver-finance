// CSV export for reports (Phase 7F). Excel-friendly: UTF-8 with a BOM so
// Arabic names open correctly, CRLF line endings, and every cell quoted when
// needed. Text that starts with = + - @ is prefixed with ' so a spreadsheet
// never runs it as a formula (CSV injection).

export type CsvCell = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: CsvCell[][]): string {
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Starts a download of the rows as a .csv file (browser only). */
export function downloadCsv(filename: string, rows: CsvCell[][]): void {
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
