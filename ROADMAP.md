# Roadmap — Driver Revenue & Expense Tracker

**Rescanned and consolidated** from the full project plan (`design.md`). Organized in dependency order — each phase produces something testable before the next begins, and the schema is set up front so the three modules (Driver, Partner, Admin) don't require rework later.

---

## Phase 0 — Project Foundation

**Goal:** Repos, environments, and pipelines exist and deploy successfully.

- Create new Next.js (TypeScript, App Router) project — separate repo from the existing travel-document system
- Set up a new, separate Supabase project (own database, own Auth realm)
- Configure Tailwind CSS
- Set up role-based Supabase Auth (drivers, partners, admin — see `design.md` §2)
- Deploy a minimal build to Vercel to confirm the pipeline end-to-end early
- Add `AGENTS.md`, `.agents/rules/`, and `skills/` to the repo root so all future agent work follows the same standards from day one

**Deliverable:** Empty app, live URL, working CI/deploy pipeline.

---

## Phase 1 — Complete Database Schema (All Three Modules)

**Goal:** The full data model is in place before any UI is built — this avoids re-migrating tables once the Partner/Admin modules are underway.

- Create core tables: `drivers`, `partners`, `vehicles`, `vehicle_partners`
- Create activity tables: `rides`, `expenses` (with `vehicle_id` and `driver_id` from the start)
- Create supporting tables: `audit_log`, `daily_summary`, `salary_calculations`, `salary_calculation_shares`
- Add indexes: `(driver_id, ride_date)`, `(driver_id, expense_date)`, `(driver_id, summary_date)`, `(vehicle_id, ...)` on revenue-share tables
- Write RLS policies for all three roles (see `skills/supabase-rls/SKILL.md`)
- Write triggers: `audit_log` on `UPDATE`, `daily_summary` recalculation on `INSERT`/`UPDATE`/`DELETE`
- Enforce `expenses.receipt_image_url NOT NULL`
- Enforce `vehicle_partners` percentage-sums-to-100 rule
- Set up Supabase Storage bucket for receipt images (private, signed URLs)

**Deliverable:** Full schema migrated; RLS tested with two accounts per role (driver, partner, admin) to confirm cross-account isolation on every table.

---

## Phase 2 — PWA Shell & Authentication

**Goal:** All three roles can log in through the correct route, on the correct platform.

- PWA manifest, icons, theme colors, service worker (app-shell caching)
- Role-aware login and routing: `/driver`, `/partner`, `/admin`
- Confirm "Add to Home Screen" on real Android and iOS devices

**Deliverable:** A driver, a partner, and an admin can each log in and land on their own module, with no access to the others.

---

## Phase 3 — Driver Module: Ride & Expense Entry

**Goal:** Core field-entry flow works, online-first.

- "Add Ride" screen — per-ride and daily-total modes
- "Add Expense" screen — category, amount, **mandatory receipt photo** (save disabled without one)
- "My Day" home screen — live running totals
- Client-side image compression before upload

**Deliverable:** A driver can log a ride and an expense (with photo) and see today's totals update immediately.

---

## Phase 4 — Offline-First Sync (Driver Module)

**Goal:** Entries, including receipt photos, survive no-signal conditions and sync automatically.

- IndexedDB local queue (Dexie.js)
- Local-first writes, background sync on reconnect
- Receipt photo syncs as one atomic unit with its expense record (see `skills/pwa-offline-sync/SKILL.md`)
- Airplane-mode test on real devices, on real Jeddah–Makkah–Madinah-style routes if possible

**Deliverable:** A driver can log entries with photos while fully offline and see them sync correctly once reconnected, with zero data loss.

---

## Phase 5 — Driver Module: History & Same-Day Editing

**Goal:** Drivers can review and correct only today's entries.

- History list grouped by day
- Today: inline editable. Past days: locked, view-only
- "Request correction" flow for locked entries, notifying admin

**Deliverable:** A driver can fix a same-day mistake but cannot alter yesterday's numbers — only flag them.

---

## Phase 6 — Admin Module: Core Reporting

**Goal:** Admin sees accurate, fast, company-wide and per-driver numbers.

- Period toggle: Daily / Weekly / Monthly / Yearly / Custom
- KPI cards (revenue, expenses, net) sourced from `daily_summary`
- Per-driver sortable table
- Trend chart (revenue vs. expenses over time)

**Deliverable:** Admin dashboard returns accurate numbers in ~1–2 seconds even with 100+ drivers of historical data.

---

## Phase 7 — Admin Module: Driver Drill-Down & Audit

**Goal:** Admin can investigate any driver or entry down to the receipt image and edit history.

- Driver detail page (day-by-day entries)
- Inline receipt image viewing
- Audit trail viewer (old value → new value, timestamp)
- Correction-request queue with approve/reject/edit

**Deliverable:** Admin can fully trace any entry back to its origin, its receipt, and every edit made to it.

---

## Phase 8 — Revenue-Sharing & Salary Calculation

**Goal:** Vehicles with multiple partners get automatic, auditable percentage-based payout calculations.

- Admin "Vehicle Setup" screen: manage `vehicle_partners`, add/edit partner accounts, enforce 100%-sum rule
- Calculation engine (see `skills/revenue-share-calc/SKILL.md`): net = revenue − expenses, split by effective percentage
- Draft/finalize workflow — finalized calculations are immutable
- Scheduled monthly auto-draft (Supabase Edge Function, cron) + manual on-demand runs for any custom period
- "Pending Review" list, finalize action, partner payout history

**Deliverable:** Admin reviews a vehicle's monthly draft (e.g. driver 35% / partner 32.5% / partner 32.5%), confirms shares are correct, and finalizes it — or runs it manually for any period.

---

## Phase 9 — Partner Module

**Goal:** Partners see only their own vehicle's numbers, nothing else.

- Partner login (admin-created accounts only)
- Vehicle-scoped RLS-backed views: revenue, expenses, net, own share — by day/week/month/year
- Payout history (finalized calculations only, own share only)
- Explicit cross-partner isolation test: confirm Partner A cannot read Partner B's vehicle data, including via direct API calls, not just through the UI

**Deliverable:** A partner logs in and sees exactly their vehicle's financials and their own payout history — nothing about other vehicles, other partners, or individual driver identities.

---

## Phase 10 — Export & Notifications

**Goal:** Data leaves the system in usable form; relevant people are alerted to what needs attention.

- CSV/Excel export (admin, any filtered view)
- Notifications: driver → admin (correction requests), admin → driver (correction resolved), admin → partner (calculation finalized, optional)

**Deliverable:** Admin can export a month's data in two clicks; correction requests and finalized payouts trigger notifications.

---

## Phase 11 — Testing, Hardening & Pilot Launch

**Goal:** The system is proven reliable at real scale before full rollout.

- Load-test RLS policies and dashboard queries with simulated 100+ driver, multi-month data
- Confirm receipt-image storage costs/limits at expected volume
- Pilot with 5–10 real drivers (and at least one real partner) for 1–2 weeks
- Collect feedback: entry speed, offline reliability, friction from the mandatory-photo rule
- Fix pilot findings, then roll out to all 100+ drivers

**Deliverable:** Full system live, pilot-tested, hardened.

---

## Build Order Summary

```
Phase 0  → Project Foundation
Phase 1  → Full Database Schema (all 3 roles, up front)
Phase 2  → PWA Shell + Role-Aware Auth
Phase 3  → Driver: Ride & Expense Entry
Phase 4  → Driver: Offline-First Sync
Phase 5  → Driver: History + Same-Day Editing
Phase 6  → Admin: Core Reporting
Phase 7  → Admin: Drill-Down + Audit
Phase 8  → Revenue-Sharing + Salary Calculation
Phase 9  → Partner Module
Phase 10 → Export + Notifications
Phase 11 → Testing + Pilot + Launch
```

## Minimum Viable Release

If a faster first release is preferred, the smallest useful slice is:
**Phase 0 → 1 → 2 → 3 → 6** (driver entry + admin reporting, no offline sync, no revenue-sharing, no partner module yet). Everything else layers on afterward without requiring schema rework, since the full schema is already in place from Phase 1.
