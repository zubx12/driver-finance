import { riyadhToday } from '@/lib/dates';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DbRide {
  id: string;
  driver_id: string;
  vehicle_id: string;
  amount: number;
  payment_method: 'Cash' | 'Voucher' | 'Card' | 'Transfer';
  payment_status: 'Received' | 'Outstanding' | 'Collected' | 'Disputed' | 'Cancelled';
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
  payment_status?: 'Received' | 'Outstanding' | 'Collected' | 'Disputed' | 'Cancelled';
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
  const today = riyadhToday();
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


