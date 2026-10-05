// Driver monthly financial report (driver workspace, Reports tab, W4).
//
// One model, built from the database's answers (get_driver_profile for the
// month's rides and expenses, get_driver_statement for the settlement,
// handovers and employment dates). The screen, the PDF, the Excel file and
// the CSV are all produced from the sections below, so they cannot show
// different numbers.

import type { DriverSettlement } from '@/lib/data/settlements';

export const COMPANY_NAME = 'Mehar Transport';
export const REPORT_TITLE = 'Driver Monthly Financial Report';

export interface ReportRide {
  ride_date: string; amount: number; payment_method: string; payment_status: string;
  reference: string | null; payers: { name: string } | null; vehicles: { plate_number: string } | null;
}
export interface ReportExpense {
  expense_date: string; amount: number; category: string; description: string | null;
  paid_by: 'driver' | 'company' | 'office'; allocation: string; receipt_image_url: string | null;
  vehicles: { plate_number: string } | null;
}
export interface ReportHandover {
  date: string; amount: number; status: string; method: string; reference: string | null; admin_note: string | null;
}

export interface DriverMonthReportInput {
  month: string;                     // YYYY-MM
  driver: { name: string; driver_code: string; phone: string | null; status: string };
  vehicle: { make: string; model: string; plate_number: string } | null;
  rides: ReportRide[];
  expenses: ReportExpense[];
  settlement: DriverSettlement;
  handovers: ReportHandover[];
  employment: { joined_on: string; last_working_day: string | null; left_on: string | null; leave_reason: string | null }[];
  generatedAt: Date;
  generatedBy: string | null;
}

export type Cell = string | number | null;
export interface ReportSection {
  title: string;
  columns: string[];
  /** Column indexes holding money (right-aligned, 2 decimals). */
  money?: number[];
  rows: Cell[][];
  total?: Cell[];
  note?: string;
}

export interface DriverMonthReport {
  company: string;
  title: string;
  fileBase: string;                  // e.g. driver-report-DRV-00001-2026-08
  info: [string, string][];          // header lines (label, value)
  summary: {
    rides: number; revenue: number; cash: number; vouchers: number; other: number;
    expensesTotal: number; expensesPaidByDriver: number; driverPay: number; payFinal: boolean;
    handedOver: number; closingBalance: number;
  };
  sections: ReportSection[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = <T,>(xs: T[], f: (x: T) => number) => r2(xs.reduce((t, x) => t + Number(f(x) || 0), 0));
const PAID_BY: Record<string, string> = { driver: 'Driver', company: 'Company', office: 'Office' };
const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function monthPeriod(month: string): { start: string; end: string; label: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const start = `${month}-01`;
  const end = `${month}-${String(last).padStart(2, '0')}`;
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { start, end, label };
}

export function buildDriverMonthReport(input: DriverMonthReportInput): DriverMonthReport {
  const { rides, expenses, settlement: s, handovers } = input;
  const period = monthPeriod(input.month);

  const byMethod = (m: string) => rides.filter(r => r.payment_method === m);
  const vouchers = byMethod('Voucher');
  const otherRides = rides.filter(r => r.payment_method !== 'Cash' && r.payment_method !== 'Voucher');
  const payFinal = s.pay_lines.length > 0 && s.pay_lines.every(p => p.status === 'finalized');

  const summary = {
    rides: rides.length,
    revenue: sum(rides, r => r.amount),
    cash: sum(byMethod('Cash'), r => r.amount),
    vouchers: sum(vouchers, r => r.amount),
    other: sum(otherRides, r => r.amount),
    expensesTotal: sum(expenses, e => e.amount),
    expensesPaidByDriver: sum(expenses.filter(e => e.paid_by === 'driver'), e => e.amount),
    driverPay: r2(Number(s.driver_pay)),
    payFinal,
    handedOver: r2(Number(s.handovers_confirmed)),
    closingBalance: r2(Number(s.closing_balance)),
  };

  const employment = input.employment.map(e =>
    `joined ${fmtDate(e.joined_on)}${e.last_working_day ? `, last working day ${fmtDate(e.last_working_day)}` : ''}${e.left_on ? `, left ${fmtDate(e.left_on)}` : ''}${e.leave_reason ? ` (${e.leave_reason})` : ''}`);

  const info: [string, string][] = [
    ['Driver', input.driver.name],
    ['Driver code', input.driver.driver_code],
    ['Status', input.driver.status],
    ...(input.driver.phone ? [['Phone', input.driver.phone] as [string, string]] : []),
    ...(input.vehicle ? [['Vehicle', `${input.vehicle.make} ${input.vehicle.model} (${input.vehicle.plate_number})`] as [string, string]] : []),
    ...(employment.length ? [['Employment', employment.join('; ')] as [string, string]] : []),
    ['Reporting period', `${fmtDate(period.start)} – ${fmtDate(period.end)}`],
    ['Settlement', s.status === 'closed' ? 'Settled' : 'Open (figures may still change)'],
    ['Generated', `${input.generatedAt.toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} (Riyadh time)${input.generatedBy ? ` by ${input.generatedBy}` : ''}`],
  ];

  const methods = ['Cash', 'Voucher', 'Card', 'Transfer'];
  const extraMethods = [...new Set(rides.map(r => r.payment_method))].filter(m => !methods.includes(m));
  const statusesOf = (xs: ReportRide[], st: string) => xs.filter(v => v.payment_status === st);

  const categories = [...new Set(expenses.map(e => e.category))].sort();

  const settlementRows: Cell[][] = [
    ['Opening balance (carried from last month)', r2(Number(s.opening_balance))],
    ['+ Cash collected', r2(Number(s.cash_collected))],
    ['+ Vouchers collected in cash', r2(Number(s.vouchers_collected))],
    ['− Expenses paid by the driver', r2(-Number(s.expenses_paid))],
    [`− Driver pay${payFinal ? '' : ' (payout not finalized yet)'}`, r2(-Number(s.driver_pay))],
    ['− Cash handed over (confirmed)', r2(-Number(s.handovers_confirmed))],
    ['= Closing balance (+ driver owes the office, − office owes the driver)', summary.closingBalance],
    ...(s.status === 'closed' ? [
      ['Paid at settlement', r2(Number(s.settled_amount ?? 0))],
      ...(Number(s.written_off ?? 0) > 0 ? [[`Written off${s.write_off_reason ? ` (${s.write_off_reason})` : ''}`, r2(Number(s.written_off))]] : []),
      ['Carried to next month', r2(Number(s.carried_forward ?? 0))],
    ] as Cell[][] : []),
  ];

  const sections: ReportSection[] = [
    {
      title: 'Performance summary',
      columns: ['Item', 'Count', 'Amount (SAR)'], money: [2],
      rows: [
        ['Bookings', summary.rides, null],
        ['Revenue', null, summary.revenue],
        ['Expenses (all)', expenses.length, summary.expensesTotal],
        ['Expenses paid by the driver', null, summary.expensesPaidByDriver],
        [`Driver pay${payFinal ? '' : ' (not finalized yet)'}`, null, summary.driverPay],
        ['Cash handed over (confirmed)', null, summary.handedOver],
      ],
    },
    {
      title: 'Payment breakdown',
      columns: ['Method', 'Bookings', 'Amount (SAR)'], money: [2],
      rows: [...methods, ...extraMethods].map(m => [m, byMethod(m).length, sum(byMethod(m), r => r.amount)]),
      total: ['Total', rides.length, summary.revenue],
    },
    {
      title: 'Voucher summary',
      columns: ['Status', 'Vouchers', 'Amount (SAR)'], money: [2],
      rows: ['Collected', 'Outstanding', 'Received', 'Disputed', 'Cancelled']
        .filter(st => statusesOf(vouchers, st).length > 0 || st === 'Collected' || st === 'Outstanding')
        .map(st => [st, statusesOf(vouchers, st).length, sum(statusesOf(vouchers, st), v => v.amount)]),
      total: ['Total', vouchers.length, summary.vouchers],
    },
    {
      title: 'Expense summary',
      columns: ['Category', 'Expenses', 'Paid by driver (SAR)', 'Amount (SAR)'], money: [2, 3],
      rows: categories.map(c => {
        const xs = expenses.filter(e => e.category === c);
        return [c, xs.length, sum(xs.filter(e => e.paid_by === 'driver'), e => e.amount), sum(xs, e => e.amount)];
      }),
      total: ['Total', expenses.length, summary.expensesPaidByDriver, summary.expensesTotal],
    },
    {
      title: 'Settlement with the office',
      columns: ['Line', 'Amount (SAR)'], money: [1],
      rows: settlementRows,
    },
    {
      title: 'Bookings',
      columns: ['Date', 'Vehicle', 'Method', 'Payer', 'Reference', 'Status', 'Amount (SAR)'], money: [6],
      rows: [...rides].sort((a, b) => a.ride_date.localeCompare(b.ride_date)).map(r => [
        fmtDate(r.ride_date), r.vehicles?.plate_number ?? '', r.payment_method, r.payers?.name ?? '',
        r.reference ?? '', r.payment_method === 'Voucher' ? r.payment_status : 'Received', r2(Number(r.amount)),
      ]),
      total: ['Total', '', '', '', '', '', summary.revenue],
    },
    {
      title: 'Expenses',
      columns: ['Date', 'Vehicle / type', 'Category', 'Description', 'Paid by', 'Receipt', 'Amount (SAR)'], money: [6],
      rows: [...expenses].sort((a, b) => a.expense_date.localeCompare(b.expense_date)).map(e => [
        fmtDate(e.expense_date), e.allocation === 'Vehicle' ? (e.vehicles?.plate_number ?? 'Vehicle') : `${e.allocation} expense`,
        e.category, e.description ?? '', PAID_BY[e.paid_by] ?? e.paid_by, e.receipt_image_url ? 'Yes' : 'No', r2(Number(e.amount)),
      ]),
      total: ['Total', '', '', '', '', '', summary.expensesTotal],
    },
    {
      title: 'Cash handovers',
      columns: ['Date', 'Method', 'Reference', 'Status', 'Amount (SAR)'], money: [4],
      rows: handovers.map(h => [
        fmtDate(h.date), h.method === 'bank_transfer' ? 'Bank transfer' : 'Cash', h.reference ?? '',
        h.status === 'submitted' ? 'Waiting' : h.status === 'confirmed' ? 'Confirmed' : 'Disputed', r2(Number(h.amount)),
      ]),
      note: 'Only confirmed handovers count in the settlement.',
    },
  ];

  return {
    company: COMPANY_NAME,
    title: REPORT_TITLE,
    fileBase: `driver-report-${input.driver.driver_code}-${input.month}`,
    info,
    summary,
    sections,
  };
}
