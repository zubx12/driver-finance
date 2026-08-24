---
name: supabase-rls-three-role
description: Use when writing or editing Row-Level Security policies for driver, partner, or admin tables in this project. Encodes the exact per-role access pattern this system requires.
---

# Skill: Supabase RLS for the Driver/Partner/Admin Model

## When to use this
Any time a migration touches RLS on `rides`, `expenses`, `daily_summary`, `vehicle_partners`, `salary_calculations`, or `salary_calculation_shares`.

## Role access pattern (must match exactly)

**Driver:**
- `SELECT`, `INSERT` on own `rides`/`expenses` (`driver_id = auth.uid()` mapped via the `drivers` table)
- `UPDATE` on own `rides`/`expenses` only where `ride_date`/`expense_date = current_date`
- No access to other drivers' rows, no access to `vehicle_partners`/`salary_calculations`

**Partner:**
- `SELECT` only, on `daily_summary`, `salary_calculations`, `salary_calculation_shares` — filtered to vehicles present in `vehicle_partners` for that partner's `partner_id`
- Never expose other partners' `percentage` or `share_amount` on the same vehicle — a partner query must filter to their own `vehicle_partner_id` even within a shared vehicle
- No `INSERT`/`UPDATE`/`DELETE` anywhere

**Admin:**
- Full read/write on all tables, via a checked `is_admin()` policy function (not just "logged in")

## Steps

1. Write the policy as a `CREATE POLICY` statement with a comment above it stating what it prevents (e.g. `-- Prevents partner A from reading partner B's vehicle data`).
2. Create two test accounts of the same role.
3. Confirm account A can read/write what it should.
4. Confirm account A **cannot** read/write account B's data — this is the step most often skipped and most important.
5. Only then mark the policy as done.

## Common mistake to avoid
Testing only with a Supabase service-role key. The service role bypasses RLS entirely — a policy that "works" under a service-role test may still be broken for real users. Always test with the anon/authenticated client using a real logged-in test user.
