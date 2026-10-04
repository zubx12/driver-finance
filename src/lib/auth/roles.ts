import type { User } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'driver' | 'partner';

type RoleSource = Pick<User, 'app_metadata'> | null | undefined;

const isRole = (value: unknown): value is AppRole =>
  value === 'admin' || value === 'driver' || value === 'partner';

/**
 * The user's main role, read ONLY from app_metadata.
 * Never read roles from user_metadata: users can edit their own
 * user_metadata, so it cannot be trusted for access control.
 * Admin checks use this (the database's is_admin() checks the same field).
 */
export function getAppRole(user: RoleSource): AppRole | undefined {
  const role = user?.app_metadata?.role;
  return isRole(role) ? role : undefined;
}

/**
 * Every role the user holds. A person can be both a driver and a partner
 * (decision D6): app_metadata.roles = ['driver', 'partner'], with the main
 * role in app_metadata.role.
 */
export function getAppRoles(user: RoleSource): AppRole[] {
  const listed = user?.app_metadata?.roles;
  const roles = Array.isArray(listed) ? listed.filter(isRole) : [];
  const main = getAppRole(user);
  if (main && !roles.includes(main)) roles.unshift(main);
  return roles;
}

export function hasAppRole(user: RoleSource, role: AppRole): boolean {
  return role === 'admin' ? getAppRole(user) === 'admin' : getAppRoles(user).includes(role);
}

/** Where the user lands after signing in, or undefined when they have no role. */
export function homePath(user: RoleSource): '/admin' | '/driver' | '/partner' | undefined {
  if (getAppRole(user) === 'admin') return '/admin';
  const main = getAppRole(user);
  if (main === 'driver' || main === 'partner') return `/${main}`;
  const roles = getAppRoles(user);
  if (roles.includes('driver')) return '/driver';
  if (roles.includes('partner')) return '/partner';
  return undefined;
}
