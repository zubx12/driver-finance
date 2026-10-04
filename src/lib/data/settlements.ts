import { createClient } from '@/lib/supabase/client';
import { riyadhToday } from '@/lib/dates';

// Driver monthly settlement (money-flow plan §2, Phase 7D). Calculated in the
// database: get_driver_settlement / get_driver_settlements / close / reopen.

export interface SettlementPayLine {
  vehicle_id: string;
  vehicle: string;
  calculation_id: string;
  status: 'draft' | 'finalized' | string;
  driver_pay: number;
}

export interface DriverSettlement {
  driver_id: string;
  driver_name: string | null;
  period_start: string;
  period_end: string;
  status: 'open' | 'closed';
  /** + the driver owes the office, − the office owes the driver */
  opening_balance: number;
  cash_collected: number;
  vouchers_collected: number;
  expenses_paid: number;
  driver_pay: number;
  handovers_confirmed: number;
  closing_balance: number;
  handovers_submitted: number;
  handovers_submitted_count: number;
  handovers_disputed: number;
  pay_lines: SettlementPayLine[];
  /** Reasons the month cannot be closed yet (empty when ready or closed). */
  blockers: string[];
  // Present once closed.
  settled_amount?: number;
  carried_forward?: number;
  settle_method?: 'cash' | 'bank_transfer' | null;
  settle_reference?: string | null;
  note?: string | null;
  closed_at?: string;
}

/** 'YYYY-MM' of the month before the current Riyadh month (the usual month to settle). */
export function previousMonth(): string {
  const [y, m] = riyadhToday().split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function currentMonth(): string {
  return riyadhToday().slice(0, 7);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export async function fetchSettlements(month: string): Promise<DriverSettlement[]> {
  const { data, error } = await createClient().rpc('get_driver_settlements', { p_month: `${month}-01` });
  if (error) throw new Error(error.message);
  return (data ?? []) as DriverSettlement[];
}

export async function fetchSettlement(driverId: string, month: string): Promise<DriverSettlement> {
  const { data, error } = await createClient().rpc('get_driver_settlement', { p_driver_id: driverId, p_month: `${month}-01` });
  if (error) throw new Error(error.message);
  return data as DriverSettlement;
}

export async function closeSettlement(args: {
  driverId: string;
  month: string;
  settledAmount: number;
  method: 'cash' | 'bank_transfer' | null;
  reference?: string;
  note?: string;
}): Promise<void> {
  const { error } = await createClient().rpc('close_driver_settlement', {
    p_driver_id: args.driverId,
    p_month: `${args.month}-01`,
    p_settled_amount: args.settledAmount,
    p_method: args.method,
    p_reference: args.reference || null,
    p_note: args.note || null,
  });
  if (error) throw new Error(error.message);
}

export async function reopenSettlement(driverId: string, month: string, reason: string): Promise<void> {
  const { error } = await createClient().rpc('reopen_driver_settlement', {
    p_driver_id: driverId, p_month: `${month}-01`, p_reason: reason,
  });
  if (error) throw new Error(error.message);
}
