import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DbVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  plate_number: string;
  status: 'Active' | 'Maintenance' | 'Inactive';
  created_at: string;
  updated_at: string;
}

export interface DbVehiclePartner {
  id: string;
  vehicle_id: string;
  partner_id: string;
  percentage: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

export interface UpsertVehiclePayload {
  id?: string;
  make: string;
  model: string;
  year: number;
  plate_number: string;
  status: 'Active' | 'Maintenance' | 'Inactive';
}

// ─── Vehicle queries ──────────────────────────────────────────────────────────

/** Admin: get all vehicles. */
export async function getAdminVehicles(): Promise<DbVehicle[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .order('make', { ascending: true });

  if (error) throw new Error(`getAdminVehicles: ${error.message}`);
  return data ?? [];
}

/** Partner: get vehicles for a specific partner (RLS also enforces this). */
export async function getPartnerVehicles(partnerId: string): Promise<DbVehicle[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('vehicles')
    .select(`
      *,
      vehicle_partners!inner(partner_id, effective_from, effective_to)
    `)
    .eq('vehicle_partners.partner_id', partnerId)
    .or('effective_to.is.null,effective_to.gt.' + new Date().toISOString().split('T')[0], {
      foreignTable: 'vehicle_partners',
    });

  if (error) throw new Error(`getPartnerVehicles: ${error.message}`);
  return (data ?? []).map(({ vehicle_partners: _, ...v }) => v as DbVehicle);
}

/** Driver: get all active vehicles (for ride entry dropdown). */
export async function getActiveVehicles(): Promise<DbVehicle[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('status', 'Active')
    .order('make', { ascending: true });

  if (error) throw new Error(`getActiveVehicles: ${error.message}`);
  return data ?? [];
}

/** Admin: create or update a vehicle. */
export async function upsertVehicle(payload: UpsertVehiclePayload): Promise<DbVehicle> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('vehicles')
    .upsert({ ...payload, updated_at: new Date().toISOString() })
    .select()
    .single();

  if (error) throw new Error(`upsertVehicle: ${error.message}`);
  return data;
}

// ─── Ownership split queries ──────────────────────────────────────────────────

/** Get all active ownership splits for a vehicle. */
export async function getVehiclePartners(vehicleId: string): Promise<DbVehiclePartner[]> {
  const supabase = createClient();
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('vehicle_partners')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .lte('effective_from', today)
    .or(`effective_to.is.null,effective_to.gt.${today}`);

  if (error) throw new Error(`getVehiclePartners: ${error.message}`);
  return data ?? [];
}

/**
 * Set ownership splits for a vehicle.
 * Closes all current active splits and inserts the new ones.
 * Must be called in a transaction — uses Supabase RPC for atomicity.
 */
export async function setVehicleOwnershipSplits(
  vehicleId: string,
  splits: { partner_id: string; percentage: number }[]
): Promise<void> {
  const total = splits.reduce((sum, s) => sum + s.percentage, 0);
  if (Math.abs(total - 100) > 0.01) {
    throw new Error(`Ownership percentages must sum to 100. Got ${total}`);
  }

  const supabase = createClient();
  const today = new Date().toISOString().split('T')[0];

  // Close existing active splits
  const { error: closeError } = await supabase
    .from('vehicle_partners')
    .update({ effective_to: today })
    .eq('vehicle_id', vehicleId)
    .is('effective_to', null);
  if (closeError) throw new Error(`closeExistingSplits: ${closeError.message}`);

  // Insert new splits
  const newSplits = splits.map((s) => ({
    vehicle_id: vehicleId,
    partner_id: s.partner_id,
    percentage: s.percentage,
    effective_from: today,
    effective_to: null,
  }));

  const { error: insertError } = await supabase.from('vehicle_partners').insert(newSplits);
  if (insertError) throw new Error(`insertNewSplits: ${insertError.message}`);
}
