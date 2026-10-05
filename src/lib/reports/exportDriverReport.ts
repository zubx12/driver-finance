// Writers for the driver monthly report (W4): CSV, Excel (.xlsx) and PDF, all
// from the same DriverMonthReport sections. The Excel and PDF libraries load
// only when a download is clicked.

import { downloadCsv, type CsvCell } from '@/lib/csv';
import type { Cell, DriverMonthReport } from './driverMonthReport';

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// The built-in PDF font has no minus sign (U+2212); the PDF uses a hyphen.
const pdfText = (v: string) => v.replace(/−/g, '-');

/** Every line of the report as rows (used for the CSV; also tested). */
export function driverReportRows(r: DriverMonthReport): CsvCell[][] {
  const rows: CsvCell[][] = [[r.company], [r.title], ...r.info.map(([k, v]) => [k, v])];
  for (const s of r.sections) {
    rows.push([], [s.title], s.columns, ...s.rows);
    if (s.total) rows.push(s.total);
    if (s.note) rows.push([s.note]);
  }
  return rows;
}

export function exportDriverReportCsv(r: DriverMonthReport): void {
  downloadCsv(`${r.fileBase}.csv`, driverReportRows(r));
}

export async function exportDriverReportXlsx(r: DriverMonthReport): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  type XCell = { value: string | number; type?: typeof Number | typeof String; fontWeight?: 'bold'; format?: string } | null;
  const toCell = (v: Cell, isMoney: boolean, bold = false): XCell => {
    if (v === null || v === '') return null;
    if (typeof v === 'number') return { value: v, type: Number, format: isMoney ? '#,##0.00' : '0', ...(bold ? { fontWeight: 'bold' as const } : {}) };
    return { value: v, type: String, ...(bold ? { fontWeight: 'bold' as const } : {}) };
  };
  const tableRows = (title: string) => {
    const s = r.sections.find(x => x.title === title)!;
    const money = new Set(s.money ?? []);
    return [
      s.columns.map(c => toCell(c, false, true)),
      ...s.rows.map(row => row.map((c, i) => toCell(c, money.has(i)))),
      ...(s.total ? [s.total.map((c, i) => toCell(c, money.has(i), true))] : []),
    ];
  };

  // Sheet 1: header, summaries and settlement; then one sheet per list.
  const summary: XCell[][] = [
    [toCell(r.company, false, true)], [toCell(r.title, false, true)],
    ...r.info.map(([k, v]) => [toCell(k, false, true), toCell(v, false)]),
  ];
  for (const s of r.sections.slice(0, 5)) {
    summary.push([], [toCell(s.title, false, true)], ...tableRows(s.title));
  }

  await writeExcelFile([
    { data: summary, sheet: 'Summary', columns: [{ width: 46 }, { width: 18 }, { width: 18 }, { width: 18 }] },
    { data: tableRows('Bookings'), sheet: 'Bookings', stickyRowsCount: 1,
      columns: [{ width: 13 }, { width: 12 }, { width: 10 }, { width: 22 }, { width: 14 }, { width: 12 }, { width: 14 }] },
    { data: tableRows('Expenses'), sheet: 'Expenses', stickyRowsCount: 1,
      columns: [{ width: 13 }, { width: 18 }, { width: 16 }, { width: 30 }, { width: 10 }, { width: 9 }, { width: 14 }] },
    { data: tableRows('Cash handovers'), sheet: 'Handovers', stickyRowsCount: 1,
      columns: [{ width: 13 }, { width: 14 }, { width: 16 }, { width: 12 }, { width: 14 }] },
  ]).toFile(`${r.fileBase}.xlsx`);
}

/** Builds the PDF document (separate from saving it, so it can be tested). */
export async function buildDriverReportPdf(r: DriverMonthReport) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Header
  doc.setFont('helvetica', 'bold').setFontSize(16).text(r.company, margin, 48);
  doc.setFont('helvetica', 'normal').setFontSize(12).text(r.title, margin, 66);
  doc.setDrawColor(200).line(margin, 76, pageW - margin, 76);
  autoTable(doc, {
    startY: 84, margin: { left: margin, right: margin }, theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 110 } },
    body: r.info.map(([k, v]) => [k, pdfText(v)]),
  });

  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;
  let gap = 22;
  for (const s of r.sections) {
    const moneyCols = new Set(s.money ?? []);
    const fmt = (c: Cell, i: number) =>
      pdfText(typeof c === 'number' ? (moneyCols.has(i) ? money(c) : String(c)) : (c ?? ''));
    const align = (i: number) => (moneyCols.has(i) ? { halign: 'right' as const } : {});
    let y = lastY() + gap;
    gap = 22;
    if (y > doc.internal.pageSize.getHeight() - 80) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold').setFontSize(11).text(s.title.toUpperCase(), margin, y);
    autoTable(doc, {
      startY: y + 6, margin: { left: margin, right: margin }, theme: 'striped',
      styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [55, 65, 81] }, footStyles: { fillColor: [229, 231, 235], textColor: 20, fontStyle: 'bold' },
      head: [s.columns.map((c, i) => ({ content: c, styles: align(i) }))],
      body: s.rows.length ? s.rows.map(row => row.map(fmt)) : [[{ content: 'None', colSpan: s.columns.length, styles: { textColor: 120 } }]],
      foot: s.total ? [s.total.map((c, i) => ({ content: fmt(c, i), styles: align(i) }))] : undefined,
      columnStyles: Object.fromEntries([...moneyCols].map(i => [i, align(i)])),
    });
    if (s.note) {
      doc.setFont('helvetica', 'italic').setFontSize(8).text(pdfText(s.note), margin, lastY() + 12);
      gap = 34;   // keep the next heading clear of the note
    }
  }

  // Page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120)
      .text(`${r.company} · ${r.title} · page ${i} of ${pages}`, margin, doc.internal.pageSize.getHeight() - 20);
  }
  return doc;
}

export async function exportDriverReportPdf(r: DriverMonthReport): Promise<void> {
  (await buildDriverReportPdf(r)).save(`${r.fileBase}.pdf`);
}
