import { describe, it, expect } from 'vitest';
import { getAppRole, getAppRoles, hasAppRole, homePath } from '@/lib/auth/roles';

type Meta = { app_metadata: Record<string, unknown>; user_metadata?: Record<string, unknown> };
const user = (app: Record<string, unknown>, userMeta: Record<string, unknown> = {}): Meta =>
  ({ app_metadata: app, user_metadata: userMeta });

describe('roles', () => {
  it('ignores roles in user-editable metadata', () => {
    const u = user({}, { role: 'admin', roles: ['admin'] });
    expect(getAppRole(u)).toBeUndefined();
    expect(hasAppRole(u, 'admin')).toBe(false);
    expect(homePath(u)).toBeUndefined();
  });

  it('reads a single main role', () => {
    const u = user({ role: 'driver' });
    expect(getAppRoles(u)).toEqual(['driver']);
    expect(hasAppRole(u, 'partner')).toBe(false);
    expect(homePath(u)).toBe('/driver');
  });

  it('supports a driver who is also a partner (D6)', () => {
    const u = user({ role: 'driver', roles: ['driver', 'partner'] });
    expect(hasAppRole(u, 'driver')).toBe(true);
    expect(hasAppRole(u, 'partner')).toBe(true);
    expect(homePath(u)).toBe('/driver');
  });

  it('never grants admin through the roles list', () => {
    const u = user({ role: 'partner', roles: ['partner', 'admin'] });
    expect(hasAppRole(u, 'admin')).toBe(false);
    expect(homePath(u)).toBe('/partner');
  });

  it('drops unknown role names', () => {
    expect(getAppRoles(user({ role: 'superuser', roles: ['owner', 'driver'] }))).toEqual(['driver']);
  });

  it('sends admins to the admin portal', () => {
    expect(homePath(user({ role: 'admin' }))).toBe('/admin');
  });
});
