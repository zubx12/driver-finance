import { createClient } from '@/lib/supabase/client';
import type { DriverSettlement } from '@/lib/data/settlements';
import type { CsvCell } from '@/lib/csv';

// Monthly vehicle report and driver statement (Phase 7F, money-flow plan §5).
// Both come from one database call each, so the printed figures are the same
// as the payout engine, the driver settlement and the voucher handover.

type Num = number;

export interface VehicleMonthReport {
  vehicle: { id: string; plate_number: string; make: string; model: string; year: number };
  period_start: string;
  period_end: string;
  owners: { partner: string; percentage: Num; from: string; to: string | null }[];
  drivers: { driver: string; from: string; to: string | null }[];
  pay_terms: {
    driver: string; type: 'commission' | 'fixed_salary'; commission_percentage: Num | null;
    fixed_salary_amount: Num | null; bonus_rate: Num | null; from: string; to: string | null;
  }[];
  revenue_by_day: { date: string; rides: Num; cash: Num; vouchers: Num; other: Num; total: Num }[];
  revenue_totals: {
    rides: Num; cash: Num; vouchers: Num; other: Num; total: Num;
    vouchers_outstanding: Num; vouchers_collected: Num;
  };
  vouchers: {
    ride_id: string; date: string; driver: string | null; payer: string | null; reference: string | null;
    amount: Num; status: string; collected_by: string | null; collected_by_role: string | null; collected_at: string | null;
    handed_to: { partner: string; percentage: Num; amount: Num; paid_out_at: string | null }[];
  }[];
  expenses: {
    id: string; date: string; kind: 'vehicle' | 'charged'; category: string; description: string | null;
    amount: Num; paid_by: 'driver' | 'company' | 'office'; payment_method: string; driver: string | null; receipt: string | null;
  }[];
  adjustments: { amount: Num; reason: string; source_type: string | null; created_at: string }[];
  payout: null | {
    calculation_id: string; status: 'draft' | 'finalized';
    total_revenue: Num; total_expenses: Num; company_expenses: Num; charged_expenses: Num;
    adjustments_total: Num; driver_pay_total: Num; net_revenue: Num;
    loss_brought_forward: Num; loss_carried_forward: Num; company_retained: Num;
    admin_notes: string | null; calculated_at: string | null; finalized_at: string | null;
  };
  driver_pay: {
    driver: string; type: 'commission' | 'fixed_salary'; commission_percentage: Num | null;
    fixed_salary_amount: Num | null; bonus_rate: Num | null; days_applied: Num | null; base_net: Num | null;
    commission_amount: Num; salary_amount: Num; bonus_amount: Num; amount: Num;
  }[];
  shares: {
    partner: string; percentage: Num; share: Num; settlement_status: 'pending' | 'paid' | null;
    cash_amount: Num | null; voucher_amount: Num | null; vouchers_kept_by_office: boolean | null;
    paid_at: string | null; payment_method: string | null; payment_reference: string | null;
  }[];
}

export interface DriverStatement {
  settlement: DriverSettlement;
  assignments: { vehicle: string; from: string; to: string | null }[];
  cash_rides: { date: string; vehicle: string | null; amount: Num }[];
  vouchers_collected: {
    ride_date: string; collected_on: string; vehicle: string | null; payer: string | null; reference: string | null; amount: Num;
  }[];
  expenses_paid: {
    date: string; vehicle: string | null; category: string; description: string | null; amount: Num;
    from: 'cash in hand' | 'own money';
  }[];
  handovers: {
    date: string; amount: Num; status: 'submitted' | 'confirmed' | 'disputed'; method: string;
    reference: string | null; admin_note: string | null;
  }[];
}

export async function fetchVehicleMonthReport(vehicleId: string, month: string): Promise<VehicleMonthReport> {
  const { data, error } = await createClient().rpc('get_vehicle_month_report', { p_vehicle_id: vehicleId, p_month: `${month}-01` });
  if (error) throw new Error(error.message);
  return data as VehicleMonthReport;
}

export async function fetchDriverStatement(driverId: string, month: string): Promise<DriverStatement> {
  const { data, error } = await createClient().rpc('get_driver_statement', { p_driver_id: driverId, p_month: `${month}-01` });
  if (error) throw new Error(error.message);
  return data as DriverStatement;
}

const PAID_BY: Record<string, string> = { driver: 'Driver', company: 'Company', office: 'Office' };

/** The whole vehicle report as CSV rows, one section after another. */
export function vehicleReportCsv(r: VehicleMonthReport): CsvCell[][] {
  const rows: CsvCell[][] = [
    ['Monthly vehicle report', `${r.vehicle.plate_number} ${r.vehicle.make} ${r.vehicle.model}`],
    ['Period', r.period_start, r.period_end],
    [],
    ['Owners'], ['Partner', 'Percentage', 'From', 'To'],
    ...r.owners.map(o => [o.partner, o.percentage, o.from, o.to]),
    [],
    ['Drivers'], ['Driver', 'From', 'To'],
    ...r.drivers.map(d => [d.driver, d.from, d.to]),
    [],
    ['Revenue by day'], ['Date', 'Rides', 'Cash', 'Vouchers', 'Other', 'Total'],
    ...r.revenue_by_day.map(d => [d.date, d.rides, d.cash, d.vouchers, d.other, d.total]),
    ['Total', r.revenue_totals.rides, r.revenue_totals.cash, r.revenue_totals.vouchers, r.revenue_totals.other, r.revenue_totals.total],
    [],
    ['Vouchers'], ['Date', 'Driver', 'Payer', 'Reference', 'Amount', 'Status', 'Collected by', 'Collected at', 'Handed to'],
    ...r.vouchers.map(v => [
      v.date, v.driver, v.payer, v.reference, v.amount, v.status,
      v.collected_by ? `${v.collected_by} (${v.collected_by_role})` : '', v.collected_at,
      v.handed_to.map(h => `${h.partner} ${h.percentage}% = ${h.amount}`).join('; '),
    ]),
    [],
    ['Expenses'], ['Date', 'Type', 'Category', 'Description', 'Amount', 'Paid by', 'Method', 'Driver'],
    ...r.expenses.map(e => [e.date, e.kind === 'vehicle' ? 'Vehicle' : 'Charged to vehicle', e.category, e.description,
      e.amount, PAID_BY[e.paid_by] ?? e.paid_by, e.payment_method, e.driver]),
    [],
    ['Adjustments'], ['Amount', 'Reason', 'Recorded'],
    ...r.adjustments.map(a => [a.amount, a.reason, a.created_at]),
    [],
  ];
  if (r.payout) {
    const p = r.payout;
    rows.push(
      ['Payout', p.status],
      ['Revenue', p.total_revenue], ['Vehicle expenses', -p.total_expenses], ['Office expenses', -p.company_expenses],
      ['Charged expenses', -p.charged_expenses], ['Adjustments', p.adjustments_total],
      ['Driver pay', -p.driver_pay_total], ['Loss brought forward', -p.loss_brought_forward],
      ['Balance to share', p.net_revenue], ['Loss carried forward', p.loss_carried_forward],
      ['Kept by the company', p.company_retained],
      [],
      ['Driver pay'], ['Driver', 'Type', 'Rate', 'Days', 'Base', 'Commission', 'Salary', 'Bonus', 'Total'],
      ...r.driver_pay.map(d => [d.driver, d.type, d.type === 'commission' ? `${d.commission_percentage}%` : d.fixed_salary_amount,
        d.days_applied, d.base_net, d.commission_amount, d.salary_amount, d.bonus_amount, d.amount]),
      [],
      ['Partner shares'], ['Partner', 'Percentage', 'Share', 'Status', 'Cash', 'Vouchers', 'Paid on', 'Reference'],
      ...r.shares.map(s => [s.partner, s.percentage, s.share, s.settlement_status ?? 'not finalized',
        s.cash_amount, s.voucher_amount, s.paid_at, s.payment_reference]),
    );
  } else {
    rows.push(['Payout', 'not calculated yet']);
  }
  return rows;
}

/** The driver statement as CSV rows. */
export function driverStatementCsv(st: DriverStatement, driverName: string): CsvCell[][] {
  const s = st.settlement;
  return [
    ['Driver statement', driverName],
    ['Period', s.period_start, s.period_end, s.status === 'closed' ? 'Settled' : 'Open'],
    [],
    ['Opening balance', s.opening_balance], ['Cash collected', s.cash_collected], ['Vouchers collected', s.vouchers_collected],
    ['Expenses paid', -s.expenses_paid], ['Driver pay', -s.driver_pay], ['Handed over (confirmed)', -s.handovers_confirmed],
    ['Closing balance', s.closing_balance],
    ...(s.status === 'closed' ? [
      ['Paid at settlement', s.settled_amount ?? 0],
      ...(Number(s.written_off ?? 0) > 0 ? [['Written off', s.written_off ?? 0, s.write_off_reason ?? '']] : []),
      ['Carried to next month', s.carried_forward ?? 0],
    ] : []),
    [],
    ['Cash rides'], ['Date', 'Vehicle', 'Amount'],
    ...st.cash_rides.map(r => [r.date, r.vehicle, r.amount]),
    [],
    ['Vouchers collected'], ['Ride date', 'Collected on', 'Vehicle', 'Payer', 'Reference', 'Amount'],
    ...st.vouchers_collected.map(v => [v.ride_date, v.collected_on, v.vehicle, v.payer, v.reference, v.amount]),
    [],
    ['Expenses paid by the driver'], ['Date', 'Vehicle', 'Category', 'Description', 'Paid from', 'Amount'],
    ...st.expenses_paid.map(e => [e.date, e.vehicle, e.category, e.description, e.from, e.amount]),
    [],
    ['Cash handovers'], ['Date', 'Amount', 'Status', 'Method', 'Reference', 'Office note'],
    ...st.handovers.map(h => [h.date, h.amount, h.status, h.method, h.reference, h.admin_note]),
  ];
}
