import { createClient } from '@/lib/supabase/client';
import { createServerClient } from '@supabase/ssr';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DbRide {
  id: string;
  driver_id: string;
  vehicle_id: string;
  amount: number;
  payment_method: 'Cash' | 'Voucher' | 'Card' | 'Transfer';
  payer_id?: string;
  reference?: string;
  ride_date: string; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
}

export interface InsertRidePayload {
  driver_id: string;
  vehicle_id: string;
  amount: number;
  payment_method: 'Cash' | 'Voucher' | 'Card' | 'Transfer';
  payer_id?: string;
  reference?: string;
  ride_date: string;
}

// ─── Driver ride queries ────────────────────────────────────────────────────

/** Get all rides for a driver within a date range. RLS scopes to own rows. */
export async function getDriverRides(
  driverId: string,
  start: string,
  end: string
): Promise<DbRide[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('driver_id', driverId)
    .gte('ride_date', start)
    .lte('ride_date', end)
    .order('ride_date', { ascending: false });

  if (error) throw new Error(`getDriverRides: ${error.message}`);
  return data ?? [];
}

/** Get rides for a specific driver for today. Used for "My Day" view. */
export async function getDriverTodayRides(driverId: string): Promise<DbRide[]> {
  const today = new Date().toISOString().split('T')[0];
  return getDriverRides(driverId, today, today);
}

/** Insert a new ride. Driver RLS enforces that driver_id matches the logged-in user. */
export async function insertRide(payload: InsertRidePayload): Promise<DbRide> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('rides')
    .insert(payload)
    .select()
    .single();

  if (error) throw new Error(`insertRide: ${error.message}`);
  return data;
}

/** Update a ride. RLS blocks updates to any ride that isn't today's. */
export async function updateRide(
  id: string,
  updates: Partial<Pick<DbRide, 'amount' | 'payment_method' | 'reference'>>
): Promise<DbRide> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('rides')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`updateRide: ${error.message}`);
  return data;
}

// ─── Admin queries ────────────────────────────────────────────────────────────

/** Admin: get all rides for a vehicle within a period. */
export async function getVehicleRides(
  vehicleId: string,
  start: string,
  end: string
): Promise<DbRide[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .gte('ride_date', start)
    .lte('ride_date', end)
    .order('ride_date', { ascending: false });

  if (error) throw new Error(`getVehicleRides: ${error.message}`);
  return data ?? [];
}

/** Admin: get all rides across all vehicles with optional filters. */
export async function getAllRides(filters?: {
  vehicleId?: string;
  driverId?: string;
  start?: string;
  end?: string;
}): Promise<DbRide[]> {
  const supabase = createClient();
  let query = supabase.from('rides').select('*');

  if (filters?.vehicleId) query = query.eq('vehicle_id', filters.vehicleId);
  if (filters?.driverId) query = query.eq('driver_id', filters.driverId);
  if (filters?.start) query = query.gte('ride_date', filters.start);
  if (filters?.end) query = query.lte('ride_date', filters.end);

  const { data, error } = await query.order('ride_date', { ascending: false });
  if (error) throw new Error(`getAllRides: ${error.message}`);
  return data ?? [];
}
