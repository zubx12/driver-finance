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

export interface CreatePartnerPayload {
  name: string;
  phone: string;
  password: string;
  status?: 'Active' | 'Inactive';
}

// ─── Partner queries ──────────────────────────────────────────────────────────

/** Get all partners. Admin only (RLS enforced). */
export async function getAdminPartners(): Promise<DbPartner[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(`getAdminPartners: ${error.message}`);
  return data ?? [];
}

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

/**
 * Admin: Create a new partner account.
 * Calls a server action — Supabase Auth admin API must not be called from the browser.
 */
export async function createPartner(payload: CreatePartnerPayload): Promise<{ partnerId: string }> {
  const response = await fetch('/api/admin/create-partner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message ?? 'Failed to create partner');
  }

  return response.json();
}
