import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DbDriver {
  id: string;
  name: string;
  phone: string;
  linked_auth_id: string | null;
  status: 'Active' | 'Inactive' | 'Suspended';
  created_at: string;
  updated_at: string;
}

export interface CreateDriverPayload {
  name: string;
  phone: string; // Used as the Auth phone identifier
  password: string; // Initial password set by admin
  status?: 'Active' | 'Inactive';
}

// ─── Driver queries ───────────────────────────────────────────────────────────

/** Get all drivers. Admin only (RLS enforced). */
export async function getAdminDrivers(): Promise<DbDriver[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(`getAdminDrivers: ${error.message}`);
  return data ?? [];
}

/** Get a single driver by their linked auth user id. Used post-login. */
export async function getDriverByAuthId(authId: string): Promise<DbDriver | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('linked_auth_id', authId)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(`getDriverByAuthId: ${error.message}`);
  return data ?? null;
}

/**
 * Admin: Create a new driver account.
 * This calls a server action — never call Supabase Auth admin API from the browser.
 * See: src/app/admin/drivers/add/actions.ts
 */
export async function createDriver(payload: CreateDriverPayload): Promise<{ driverId: string }> {
  const response = await fetch('/api/admin/create-driver', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message ?? 'Failed to create driver');
  }

  return response.json();
}

/** Admin: update driver status (activate/suspend). */
export async function updateDriverStatus(
  driverId: string,
  status: 'Active' | 'Inactive' | 'Suspended'
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('drivers')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', driverId);

  if (error) throw new Error(`updateDriverStatus: ${error.message}`);
}

/** Get driver's own profile. Used by the Driver module. */
export async function getMyDriverProfile(): Promise<DbDriver | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return getDriverByAuthId(user.id);
}
