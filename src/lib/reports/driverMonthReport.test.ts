import { describe, expect, it } from 'vitest';
import { buildDriverMonthReport, monthPeriod, type DriverMonthReportInput } from './driverMonthReport';
import { driverReportRows } from './exportDriverReport';
import type { DriverSettlement } from '@/lib/data/settlements';

const settlement: DriverSettlement = {
  driver_id: 'd1', driver_name: 'Khadim Hussain', period_start: '2026-08-01', period_end: '2026-08-31', status: 'closed',
  opening_balance: 0, cash_collected: 1500, vouchers_collected: 200, expenses_paid: 180, driver_pay: 600,
  handovers_confirmed: 800, closing_balance: 120, handovers_submitted: 0, handovers_submitted_count: 0, handovers_disputed: 50,
  pay_lines: [{ vehicle_id: 'v1', vehicle: '9583 LRA', calculation_id: 'c1', status: 'finalized', driver_pay: 600 }],
  blockers: [], settled_amount: 100, written_off: 0, carried_forward: 20,
};

const input: DriverMonthReportInput = {
  month: '2026-08',
  driver: { name: 'Khadim Hussain', driver_code: 'DRV-00001', phone: '0500000000', status: 'Active' },
  vehicle: { make: 'Toyota', model: 'Hiace', plate_number: '9583 LRA' },
  rides: [
    { ride_date: '2026-08-10', amount: 1000, payment_method: 'Cash', payment_status: 'Received', reference: null, payers: null, vehicles: { plate_number: '9583 LRA' } },
    { ride_date: '2026-08-02', amount: 500, payment_method: 'Cash', payment_status: 'Received', reference: null, payers: null, vehicles: { plate_number: '9583 LRA' } },
    { ride_date: '2026-08-12', amount: 200, payment_method: 'Voucher', payment_status: 'Collected', reference: 'HM-1', payers: { name: 'Hotel Makkah' }, vehicles: { plate_number: '9583 LRA' } },
    { ride_date: '2026-08-15', amount: 300, payment_method: 'Voucher', payment_status: 'Outstanding', reference: 'HM-2', payers: { name: 'Hotel Makkah' }, vehicles: { plate_number: '9583 LRA' } },
  ],
  expenses: [
    { expense_date: '2026-08-05', amount: 180, category: 'Fuel', description: null, paid_by: 'driver', allocation: 'Vehicle', receipt_image_url: 'x/2026-08-05/a.jpg', vehicles: { plate_number: '9583 LRA' } },
    { expense_date: '2026-08-06', amount: 70, category: 'Parking', description: 'Airport', paid_by: 'company', allocation: 'Company', receipt_image_url: null, vehicles: null },
  ],
  settlement,
  handovers: [
    { date: '2026-08-20', amount: 800, status: 'confirmed', method: 'cash', reference: null, admin_note: null },
    { date: '2026-08-25', amount: 50, status: 'disputed', method: 'cash', reference: null, admin_note: 'Not received' },
  ],
  employment: [{ joined_on: '2026-08-24', last_working_day: null, left_on: null, leave_reason: null }],
  generatedAt: new Date('2026-10-05T09:00:00Z'),
  generatedBy: 'office@example.com',
};

const section = (r: ReturnType<typeof buildDriverMonthReport>, title: string) => r.sections.find(s => s.title === title)!;

describe('driver monthly report', () => {
  const r = buildDriverMonthReport(input);

  it('names the company, the driver code and the period', () => {
    expect(r.company).toBe('Mehar Transport');
    expect(r.fileBase).toBe('driver-report-DRV-00001-2026-08');
    expect(r.info).toContainEqual(['Driver code', 'DRV-00001']);
    expect(monthPeriod('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28', label: 'February 2026' });
  });

  it('adds up revenue by payment method and voucher status to the same total', () => {
    expect(r.summary).toMatchObject({ rides: 4, revenue: 2000, cash: 1500, vouchers: 500 });
    expect(section(r, 'Payment breakdown').total).toEqual(['Total', 4, 2000]);
    const v = section(r, 'Voucher summary');
    expect(v.rows).toContainEqual(['Collected', 1, 200]);
    expect(v.rows).toContainEqual(['Outstanding', 1, 300]);
    expect(v.total).toEqual(['Total', 2, 500]);
  });

  it('splits expenses by category and by who paid', () => {
    expect(r.summary.expensesTotal).toBe(250);
    expect(r.summary.expensesPaidByDriver).toBe(180);
    expect(section(r, 'Expense summary').total).toEqual(['Total', 2, 180, 250]);
  });

  it('takes the settlement from the database figures, including what was paid and carried', () => {
    const rows = section(r, 'Settlement with the office').rows;
    expect(rows).toContainEqual(['= Closing balance (+ driver owes the office, − office owes the driver)', 120]);
    expect(rows).toContainEqual(['Paid at settlement', 100]);
    expect(rows).toContainEqual(['Carried to next month', 20]);
    expect(r.summary.payFinal).toBe(true);
  });

  it('lists bookings by date with a total equal to the revenue', () => {
    const b = section(r, 'Bookings');
    expect(b.rows[0][0]).toBe('02 Aug 2026');
    expect(b.rows.reduce((t, row) => t + Number(row[6]), 0)).toBe(r.summary.revenue);
  });

  it('marks pay that is not final', () => {
    const draft = buildDriverMonthReport({ ...input, settlement: { ...settlement, status: 'open', pay_lines: [{ ...settlement.pay_lines[0], status: 'draft' }] } });
    expect(draft.summary.payFinal).toBe(false);
    expect(section(draft, 'Performance summary').rows.some(row => String(row[0]).includes('not finalized'))).toBe(true);
  });

  it('puts every section in the CSV', () => {
    const rows = driverReportRows(r);
    for (const s of r.sections) expect(rows).toContainEqual([s.title]);
    expect(rows[0]).toEqual(['Mehar Transport']);
  });
});

describe('driver monthly report PDF', () => {
  it('builds a real PDF file with the company name, driver code and every section', async () => {
    const { buildDriverReportPdf } = await import('./exportDriverReport');
    const doc = await buildDriverReportPdf(buildDriverMonthReport(input));
    const bytes = new Uint8Array(doc.output('arraybuffer'));
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('Mehar Transport');
    expect(text).toContain('DRV-00001');
    expect(text).toContain('SETTLEMENT WITH THE OFFICE');
  });
});
