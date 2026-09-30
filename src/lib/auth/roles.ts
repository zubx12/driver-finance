import type { User } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'driver' | 'partner';

/**
 * The user's role, read ONLY from app_metadata.
 * Never read the role from user_metadata: users can edit their own
 * user_metadata, so it cannot be trusted for access control.
 */
export function getAppRole(user: Pick<User, 'app_metadata'> | null | undefined): AppRole | undefined {
  const role = user?.app_metadata?.role;
  return role === 'admin' || role === 'driver' || role === 'partner' ? role : undefined;
}
