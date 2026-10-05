import { createClient } from '@/lib/supabase/client';

// Vouchers handed to partners when their share is paid (money-flow plan §3,
// Phase 7E). Calculated and enforced in the database.

export interface PreviewVoucher {
  ride_id: string;
  ride_date: string;
  payer: string | null;
  reference: string | null;
  ride_amount: number;
  percentage: number;
  /** The partner's part of this voucher. */
  amount: number;
}

export interface SettlementPreview {
  settlement_id: string;
  status: string;
  amount: number;
  cash_amount: number;
  voucher_amount: number;
  /** The office keeps the vouchers and pays the share in cash. */
  vouchers_exceed_share: boolean;
  vouchers: PreviewVoucher[];
}

export type VoucherHolderStatus = 'with_you' | 'collected_by_you' | 'owed_to_you' | 'paid_to_you' | 'cancelled';

export interface PartnerVoucher {
  id: string;
  partner_id: string;
  partner_name: string;
  settlement_id: string;
  ride_id: string;
  vehicle: string;
  ride_date: string;
  payer: string | null;
  reference: string | null;
  ride_amount: number;
  percentage: number;
  amount: number;
  ride_status: string;
  collected_by_name: string | null;
  collected_by_role: string | null;
  collected_at: string | null;
  holder_status: VoucherHolderStatus;
  paid_out_at: string | null;
  paid_out_reference: string | null;
}

export async function previewPartnerSettlement(settlementId: string): Promise<SettlementPreview> {
  const { data, error } = await createClient().rpc('preview_partner_settlement', { p_settlement_id: settlementId });
  if (error) throw new Error(error.message);
  return data as SettlementPreview;
}

export async function payPartnerSettlement(args: {
  settlementId: string;
  method: 'cash' | 'bank_transfer';
  reference: string;
  notes?: string;
  keepVouchers: boolean;
}): Promise<{ cash_amount: number; voucher_amount: number }> {
  const { data, error } = await createClient().rpc('pay_partner_settlement', {
    p_settlement_id: args.settlementId,
    p_method: args.method,
    p_reference: args.reference,
    p_notes: args.notes || null,
    p_keep_vouchers: args.keepVouchers,
  });
  if (error) throw new Error(error.message);
  return data as { cash_amount: number; voucher_amount: number };
}

/** Office: every partner (or one); partner: their own. */
export async function fetchPartnerVouchers(partnerId?: string): Promise<PartnerVoucher[]> {
  const { data, error } = await createClient().rpc('get_partner_vouchers', partnerId ? { p_partner_id: partnerId } : {});
  if (error) throw new Error(error.message);
  return (data ?? []) as PartnerVoucher[];
}

export async function payOutVoucherShare(id: string, method: 'cash' | 'bank_transfer', reference: string): Promise<void> {
  const { error } = await createClient().rpc('pay_out_voucher_share', { p_id: id, p_method: method, p_reference: reference || null });
  if (error) throw new Error(error.message);
}

export async function collectVoucher(rideId: string): Promise<void> {
  const { error } = await createClient().rpc('collect_voucher', { p_ride_id: rideId });
  if (error) throw new Error(error.message);
}

export const HOLDER_LABELS: Record<VoucherHolderStatus, string> = {
  with_you: 'To collect',
  collected_by_you: 'Collected by the partner',
  owed_to_you: 'Collected by someone else: office owes this',
  paid_to_you: 'Paid out by the office',
  cancelled: 'Cancelled / disputed',
};
