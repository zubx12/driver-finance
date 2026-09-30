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
