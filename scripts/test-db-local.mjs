/**
 * Local database tests without Docker or the Supabase CLI.
 *
 * Applies every migration in supabase/migrations to an in-memory Postgres
 * (PGlite) with minimal stand-ins for the Supabase pieces the migrations use
 * (auth.uid/auth.jwt, storage tables, anon/authenticated roles, default
 * grants), then runs supabase/tests/database/*.test.sql through a small pgTAP
 * shim. Row-level security is enforced: tests switch to the authenticated role.
 *
 * This is a fast check, not a replacement for running `supabase test db`
 * against a real Supabase stack before deploying.
 *
 * Usage: npm run test:db            (all test files)
 *        npm run test:db -- payout  (only files whose name contains 'payout')
 */
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migDir = path.join(root, 'supabase/migrations');
const testDir = path.join(root, 'supabase/tests/database');
const onlyTest = process.argv[2];

const db = await PGlite.create({ extensions: { btree_gist, uuid_ossp } });

const supabaseStubs = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE SCHEMA storage;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt() ->> 'sub', '')::uuid $$;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
CREATE PUBLICATION supabase_realtime;
GRANT USAGE ON SCHEMA public, auth, storage, extensions TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
GRANT ALL ON storage.objects TO anon, authenticated, service_role;

-- pgTAP shim (SECURITY INVOKER so lives_ok/throws_ok run as the test's role)
CREATE SCHEMA tap;
CREATE TABLE tap.results (n serial, ok boolean, description text, detail text);
GRANT USAGE ON SCHEMA tap TO PUBLIC;
GRANT ALL ON tap.results TO PUBLIC;
GRANT ALL ON SEQUENCE tap.results_n_seq TO PUBLIC;
CREATE FUNCTION public.plan(int) RETURNS text LANGUAGE sql AS $$ SELECT '1..' || $1 $$;
CREATE FUNCTION public.ok(boolean, text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO tap.results (ok, description) VALUES (coalesce($1, false), $2);
  RETURN CASE WHEN coalesce($1, false) THEN 'ok' ELSE 'not ok' END || ' - ' || $2;
END $$;
CREATE FUNCTION public.is(anyelement, anyelement, text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO tap.results (ok, description, detail)
  VALUES ($1 IS NOT DISTINCT FROM $2, $3, 'got: ' || coalesce($1::text, 'NULL') || ' expected: ' || coalesce($2::text, 'NULL'));
  RETURN $3;
END $$;
CREATE FUNCTION public.lives_ok(text, text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE $1;
    INSERT INTO tap.results (ok, description) VALUES (true, $2);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO tap.results (ok, description, detail) VALUES (false, $2, SQLSTATE || ': ' || SQLERRM);
  END;
  RETURN $2;
END $$;
CREATE FUNCTION public.throws_ok(text, text, text, text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE $1;
    INSERT INTO tap.results (ok, description, detail) VALUES (false, $4, 'no exception raised');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO tap.results (ok, description, detail)
    VALUES (SQLSTATE = $2 AND ($3 IS NULL OR SQLERRM = $3), $4, SQLSTATE || ': ' || SQLERRM);
  END;
  RETURN $4;
END $$;
CREATE FUNCTION public.finish() RETURNS SETOF text LANGUAGE sql AS $$ SELECT 'done' $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;
`;

await db.exec(supabaseStubs);

const migrations = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
for (const file of migrations) {
  const sql = fs.readFileSync(path.join(migDir, file), 'utf8').replace(/^﻿/, '');
  try {
    const notices = [];
    await db.exec(sql, { onNotice: (n) => notices.push(n.message) });
    console.log(`migrated  ${file}${notices.length ? '  [notice: ' + notices.join(' | ') + ']' : ''}`);
  } catch (e) {
    console.log(`FAILED    ${file}\n  ${e.message}${e.where ? '\n  where: ' + e.where : ''}`);
    process.exit(1);
  }
}

let failures = 0;
const tests = fs.readdirSync(testDir).filter((f) => f.endsWith('.sql') && (!onlyTest || f.includes(onlyTest))).sort();
for (const file of tests) {
  let body = fs.readFileSync(path.join(testDir, file), 'utf8').replace(/^﻿/, '');
  body = body
    .replace(/^\s*BEGIN;\s*$/m, '')
    .replace(/^\s*ROLLBACK;\s*$/m, '')
    .replace(/^\s*CREATE EXTENSION IF NOT EXISTS pgtap.*$/m, '');
  console.log(`\n# ${file}`);
  await db.exec('BEGIN');
  try {
    await db.exec(body);
  } catch (e) {
    failures++;
    console.log(`  ERROR while running: ${e.message}${e.where ? '\n  where: ' + e.where : ''}`);
  }
  try {
    await db.exec('RESET ROLE');
    const { rows } = await db.query('SELECT n, ok, description, detail FROM tap.results ORDER BY n');
    for (const r of rows) {
      if (!r.ok) failures++;
      console.log(`  ${r.ok ? 'ok    ' : 'NOT OK'} ${r.n} - ${r.description}${!r.ok && r.detail ? '  (' + r.detail + ')' : ''}`);
    }
  } finally {
    await db.exec('ROLLBACK');
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
