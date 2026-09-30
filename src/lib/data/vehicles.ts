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


// ─── Vehicle queries ──────────────────────────────────────────────────────────

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

