import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DbPartner {
  id: string;
  name: string;
  phone: string;
  linked_auth_id: string | null;
  status: 'Active' | 'Inactive';
  joined_date: string; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
}

// ─── Partner queries ──────────────────────────────────────────────────────────

/** Get the currently logged-in partner's profile. */
export async function getCurrentPartner(): Promise<DbPartner | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .eq('linked_auth_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(`getCurrentPartner: ${error.message}`);
  return data ?? null;
}

/** Get a partner by their linked auth user id. */
export async function getPartnerByAuthId(authId: string): Promise<DbPartner | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .eq('linked_auth_id', authId)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(`getPartnerByAuthId: ${error.message}`);
  return data ?? null;
}

