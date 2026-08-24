# AGENTS.md — Driver Revenue & Expense Tracker

Standing instructions for every agent working in this workspace. Read this fully before starting any task. Project context also lives in `design.md` (system design) and `ROADMAP.md` (build order) — read the relevant sections before touching related code.

---

## Project Summary

A standalone PWA where 100+ drivers log daily rides (revenue) and expenses (with a mandatory receipt photo) from their phones, often offline. Vehicles can be split among multiple partners by percentage, and the system auto-calculates each partner's share of net revenue. Three roles: Driver, Partner, Admin — one Next.js codebase, Supabase backend, access controlled by Row-Level Security.

This is **separate** from the company's existing travel-document/driver-management system — do not share a database, repo, or auth realm with that project.

---

## Environment

- Framework: Next.js (App Router), TypeScript
- Styling: Tailwind CSS
- Backend: Supabase (Postgres, Auth, Storage, Edge Functions)
- Offline storage (driver module only): IndexedDB via Dexie.js
- Package manager: npm
- Deployment target: Vercel (app) + Supabase (backend)

---

## Non-Negotiable Rules

1. **Every table gets Row-Level Security. No exceptions, no "I'll add it later."** A table without RLS is not done, regardless of what the UI does. Test each new policy with at least two accounts of the same role to confirm cross-account isolation before marking a task complete.
2. **A driver can only `INSERT`/`SELECT` their own `rides`/`expenses`, and `UPDATE` only rows dated today.** Enforce this in the database policy itself, not only in application code.
3. **`expenses.receipt_image_url` must be `NOT NULL`.** An expense without a receipt image must be impossible to create at the database level, not just blocked by a disabled button in the UI.
4. **Every `UPDATE` to `rides` or `expenses` must write to `audit_log` via a database trigger**, not application-code logging (application code can be skipped or fail silently; a trigger cannot).
5. **A partner can only read data for vehicles they are linked to in `vehicle_partners`.** Never write a query or policy that gives a partner account broader read access "for convenience" — verify with a second partner account that they cannot see the first partner's vehicle.
6. **Never hardcode secrets, API keys, or database URLs.** Use environment variables and Supabase's client patterns.
7. **Do not modify `salary_calculations` rows with `status = 'finalized'`.** Finalized calculations are historical record; if a correction is needed, create a new calculation, don't mutate the old one.
8. **Currency and monetary values:** use `numeric(10,2)` in Postgres, never `float`/`double` for money.
9. **Any schema migration touching `rides`, `expenses`, `vehicle_partners`, or `salary_calculations` requires a corresponding update to this file's data model reference and a human review before merge** — these tables carry financial and payout logic.

---

## Coding Standards

- TypeScript strict mode on.
- Components: functional, hooks-based.
- Naming: `snake_case` for database columns/tables, `camelCase` for TypeScript.
- Every Supabase query that touches a role-scoped table must be tested against RLS, not just tested with a service-role key (service-role bypasses RLS and will hide bugs).
- Prefer server components for data fetching; keep client components for interactivity (forms, offline queue).
- Write a short comment above any RLS policy explaining what it's meant to prevent — future agents editing it need the intent, not just the SQL.

---

## Testing Requirements

- Any new table: write and run at least one test that confirms a user **cannot** access another user's row (not just that they *can* access their own).
- Any offline-sync change: test in airplane mode — log an entry offline, confirm it appears locally, reconnect, confirm it syncs and matches the server record.
- Any change to salary calculation logic: verify against the worked example — a vehicle with partners at 35% / 32.5% / 32.5%, revenue 10,000, expenses 2,000 → net 8,000 → shares of 2,800 / 2,600 / 2,600.

---

## What NOT to do

- Do not build a native mobile app — this is a PWA by design decision.
- Do not add self-registration for drivers or partners — accounts are admin-created only.
- Do not let drivers edit entries older than the current day, even via an admin-adjacent "fix my own mistake" shortcut.
- Do not aggregate reporting dashboards by scanning raw `rides`/`expenses` tables directly at read time — use `daily_summary`.
- Do not expose other partners' percentages or share amounts to a partner viewing their own dashboard.

---

## File/Folder Boundaries

- `app/driver/` — driver module routes/components. Agents working here should not need to touch `app/admin/` or `app/partner/`.
- `app/partner/` — partner module (read-only views).
- `app/admin/` — admin module (full access, vehicle/partner setup, salary runs, exports).
- `supabase/migrations/` — all schema changes as versioned migrations, never manual dashboard edits for anything beyond local prototyping.
- `supabase/functions/` — Edge Functions (e.g. the monthly auto-draft salary calculation job).

Flag anything touching authentication, RLS policies, or `supabase/migrations/` for explicit human review before merge — these are the load-bearing walls of this system.
