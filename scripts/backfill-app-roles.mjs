#!/usr/bin/env node
/**
 * Phase 1 remediation: copy each user's role into app_metadata.
 *
 * Run BEFORE applying migration 20260930000001_app_metadata_roles.sql.
 *
 * The role is NOT copied from user_metadata.role, because that field is
 * user-writable and may already have been tampered with. Instead:
 *   - linked to a row in `partners` -> 'partner'
 *   - linked to a row in `drivers`  -> 'driver'
 *   - listed in --admins            -> 'admin'
 *   - anything else                 -> no role (cannot use the app)
 * A user linked to both drivers and partners gets main role 'driver' and
 * roles ['driver', 'partner'] so they can use both portals (decision D6).
 *
 * Usage (dry run, prints the plan):
 *   node --env-file=.env.local scripts/backfill-app-roles.mjs --admins owner@example.com
 * Apply:
 *   node --env-file=.env.local scripts/backfill-app-roles.mjs --admins owner@example.com --apply
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const adminsArg = args[args.indexOf('--admins') + 1];
const adminEmails = new Set(
  args.includes('--admins') && adminsArg
    ? adminsArg.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    : []
);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
if (adminEmails.size === 0) {
  console.error('Pass --admins with at least one admin email (comma-separated).');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

async function linkedIds(table) {
  const { data, error } = await admin.from(table).select('linked_auth_id').not('linked_auth_id', 'is', null);
  if (error) throw new Error(`${table}: ${error.message}`);
  return new Set(data.map((r) => r.linked_auth_id));
}

async function allUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

const [driverIds, partnerIds, users] = await Promise.all([
  linkedIds('drivers'),
  linkedIds('partners'),
  allUsers(),
]);

const foundAdmins = new Set();
const rows = users.map((u) => {
  const email = (u.email ?? '').toLowerCase();
  const isDriver = driverIds.has(u.id);
  const isPartner = partnerIds.has(u.id);
  let role = null;
  let roles = [];
  if (adminEmails.has(email)) {
    role = 'admin';
    roles = ['admin'];
    foundAdmins.add(email);
  } else if (isDriver && isPartner) {
    role = 'driver';
    roles = ['driver', 'partner'];
  } else if (isPartner) {
    role = 'partner';
    roles = ['partner'];
  } else if (isDriver) {
    role = 'driver';
    roles = ['driver'];
  }

  const claimed = u.user_metadata?.role ?? null;
  const current = u.app_metadata?.role ?? null;
  const currentRoles = Array.isArray(u.app_metadata?.roles) ? u.app_metadata.roles : [];
  return {
    email,
    id: u.id,
    role,
    roles,
    current,
    claimed,
    // user_metadata says admin but the user is not on the admin list: possible self-escalation.
    suspicious: claimed === 'admin' && role !== 'admin',
    changed: role !== current || roles.join(',') !== currentRoles.join(','),
  };
});

console.table(rows.map(({ email, role, roles, current, claimed, suspicious }) => ({
  email, 'new app role': role ?? '(none)', 'all roles': roles.join(' + ') || '(none)',
  'current app role': current ?? '(none)',
  'user_metadata role': claimed ?? '(none)', suspicious: suspicious ? 'YES' : '',
})));

for (const email of adminEmails) {
  if (!foundAdmins.has(email)) console.warn(`WARNING: admin email not found in auth.users: ${email}`);
}
const suspicious = rows.filter((r) => r.suspicious);
if (suspicious.length > 0) {
  console.warn(`\n${suspicious.length} account(s) claim admin in user_metadata but are not on the admin list.`);
  console.warn('Review them: they may have escalated themselves. They will NOT get admin.');
}

const toChange = rows.filter((r) => r.changed);
console.log(`\n${toChange.length} of ${rows.length} users need an app_metadata update.`);

if (!apply) {
  console.log('Dry run only. Re-run with --apply to write changes.');
  process.exit(0);
}

let failed = 0;
for (const r of toChange) {
  const user = users.find((u) => u.id === r.id);
  const { error } = await admin.auth.admin.updateUserById(r.id, {
    app_metadata: { ...user.app_metadata, role: r.role, roles: r.roles },
  });
  if (error) {
    failed++;
    console.error(`Failed ${r.email}: ${error.message}`);
  }
}
console.log(`Done. Updated ${toChange.length - failed}, failed ${failed}.`);
process.exit(failed > 0 ? 1 : 0);
