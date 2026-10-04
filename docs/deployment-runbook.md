# Deployment Runbook — remediation releases

How to take the remediation work (branch `fix/phase-1-app-metadata-roles`) from
code to production safely. Do every step on **staging first**, then repeat on
production. Tick each box; stop and investigate if any check fails.

Background: the audit and plan live in the session notes; payout rules are in
[payout-rules.md](payout-rules.md).

---

## 0. One-time staging setup

- [ ] Create a new Supabase project for staging (same region as production).
- [ ] Copy `.env.example` to `.env.local` and fill in the **staging** URL and keys.
- [ ] Install the Supabase CLI (`npm i -D supabase`), then `npx supabase init`
      (creates `supabase/config.toml`; answer "N" to the editor questions), then
      `npx supabase login` and `npx supabase link --project-ref <staging-ref>`.
- [ ] `npx supabase db push` — applies all migrations in `supabase/migrations`.
- [ ] `npx supabase test db --linked` — must report all tests passing (same
      files as `npm run test:db`, but on real Supabase).
- [ ] Database > Extensions: enable **pg_cron**, then re-run the SQL in
      `supabase/migrations/20260930000003_salary_monthly_drafts_cron.sql`.
- [ ] Authentication > Providers > Email: **disable "Allow new users to sign up"**.
- [ ] Deploy the branch to a Vercel preview with the staging environment variables.

## 1. Before touching production

- [ ] Take a full backup: Database > Backups (download), or `pg_dump`.
      Confirm the file opens.
- [ ] Run every query in `supabase/queries/damage-assessment.sql` against
      **production** in the SQL editor. Save each result (CSV) with the date.
- [ ] Queries 1–4 must return **no rows**, or the payout migration will stop.
      Resolve any rows with the owner first (query 4 = shares paid twice:
      needs a business decision, not a code fix).
- [ ] Query 5: confirm every listed account is a real administrator. Note the
      emails of the real admins for step 2.
- [ ] **Check production's migration history**, or `db push` may try to re-run
      every migration from the first one. In the production SQL editor run
      `select version from supabase_migrations.schema_migrations order by version;`
      - Lists up to `20260903000006` → fine, `db push` applies only the new ones.
      - Errors ("does not exist") or is empty → production was built by pasting
        SQL. Before pushing, mark the already-applied migrations as applied:
        `npx supabase migration repair --status applied 20260823185900 20260823190000 20260824000001 20260824000002 20260824000003 20260824000004 20260824000005 20260824000006 20260824000007 20260824000008 20260825000001 20260825000002 20260903000001 20260903000002 20260903000003 20260903000004 20260903000005 20260903000006`
        (only after confirming in the Table Editor that their tables, e.g.
        `payers` and `correction_requests`, exist in production).
- [ ] Announce a short maintenance window: some users may need to sign in again.
- [ ] Pause salary finalization until step 4 is complete.

## 2. Release — order matters

1. [ ] **Backfill roles** (before the migration, or admins lose access):
       ```
       node --env-file=.env.local scripts/backfill-app-roles.mjs --admins owner@example.com
       ```
       Review the dry-run table. Any `suspicious: YES` row is an account that
       claimed admin without being one — investigate it. Then re-run with `--apply`.
2. [ ] `supabase db push` — applies the remediation migrations.
       Read the notices: e.g. "Voided N duplicate pending settlement(s)".
3. [ ] Deploy the app (merge to `main`, Vercel production deploy).
4. [ ] `supabase functions delete calculate-salary` (the folder was removed from
       the repo; this removes the deployed copy).
5. [ ] Sessions pick up the new role on their next token refresh (at most the
       JWT expiry, 1 hour by default). Until then a user may see "access
       denied"; signing out and in again fixes it immediately. Admins should
       sign out and in right after the deploy.

## 3. Smoke test (with real accounts)

- [ ] Admin: log in, open Drivers, Vehicles, Salary. All load.
- [ ] Admin: Salary > pick last month > Generate Drafts. Every vehicle shows
      "calculated" or a clear error. Open one Full Breakdown: lines add up.
- [ ] Driver: log in on a phone, log a ride and an expense with a photo,
      see them sync (green), mark a voucher collected.
- [ ] Partner: log in, see own vehicle only, outstanding vouchers load.
- [ ] Security: as a driver, run in the browser console
      `await supabase.auth.updateUser({ data: { role: 'admin' } })`, refresh,
      and open `/admin` — you must be redirected away.

## 4. After release

- [ ] Re-run damage-assessment queries 6–13 and file the results for the
      Phase 6 data repair.
- [ ] Resume salary finalization (re-run each month's drafts before finalizing).

## Rollback

- **App:** redeploy the previous Vercel deployment.
- **Database:** the migrations are not automatically reversible. Restore the
  backup from step 1 into a new project, or contact the developer. Do not
  hand-edit tables. Roles written by the backfill are harmless to leave in
  place (`app_metadata.role` is ignored by the old code).
