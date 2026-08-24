# System Design — Driver Revenue & Expense Tracker

**Type:** Standalone system (separate from the existing travel-document/driver-management software)
**Stack:** Next.js (App Router) + Tailwind CSS + Supabase (Postgres, Auth, Storage, Edge Functions)
**Delivery:** Progressive Web App (PWA) for drivers/partners, responsive web dashboard for admin
**Scale target:** 100+ drivers, logging daily, from mobile phones, with intermittent connectivity

---

## 1. Purpose

Drivers log daily rides (revenue) and expenses, each expense backed by a mandatory receipt photo. Vehicles can be owned/worked by multiple partners on a percentage split; the system calculates each partner's share of net revenue (revenue − expenses) automatically. Three distinct groups use the system, each with a different scope of visibility.

---

## 2. The Three Modules

| Module | Role | Scope | Platform |
|---|---|---|---|
| **Driver Dashboard** | Driver | Own entries only. Log rides/expenses, edit same-day only. | Mobile PWA |
| **Partner Dashboard** | Partner (driving or investor) | Own vehicle(s) only — revenue, expenses, net, own payout share. Read-only. | Mobile/web PWA |
| **Admin Dashboard** | Company owner/staff | Everything — all vehicles, drivers, partners, salary runs, exports, audit log. | Web |

Partner and driver accounts are **created by admin only** — no self-registration for either role. This keeps account provisioning (and thus who has financial visibility into which vehicle) entirely under company control.

---

## 3. Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Driver PWA      │     │  Partner PWA/Web │     │  Admin Web App   │
│  (mobile-first)  │     │  (read-only)     │     │  (full access)   │
└────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
         │                        │                        │
         │   IndexedDB (offline   │                        │
         │   queue, driver only)  │                        │
         │                        │                        │
         └────────────┬───────────┴────────────┬───────────┘
                       │                        │
                  ┌────▼────────────────────────▼────┐
                  │        Supabase (Postgres)         │
                  │  - Auth (role-based)                │
                  │  - Row-Level Security per role       │
                  │  - Storage (receipt images)          │
                  │  - Edge Functions (scheduled jobs)   │
                  └───────────────────────────────────┘
```

- **Single Next.js app, role-aware routing** — one codebase, three route groups (`/driver`, `/partner`, `/admin`), each gated by the authenticated user's role. Simpler to maintain than three separate apps; RLS is the real security boundary, not the routing.
- **Supabase Auth** issues role claims; every table's RLS policy checks `auth.uid()` plus role/ownership, so access control lives in the database, not just the UI.
- **Only the Driver module needs offline-first behavior** (drivers are on the move; partners and admin are checking numbers, not entering time-sensitive field data).

---

## 4. Data Model Summary

| Table | Purpose |
|---|---|
| `drivers` | Driver accounts |
| `partners` | Partner accounts (driving or investor), created by admin |
| `vehicles` | Company vehicles |
| `vehicle_partners` | Percentage split per vehicle, time-bounded (`effective_from`/`effective_to`) |
| `rides` | Revenue entries — per-ride or daily-total, linked to `driver_id` + `vehicle_id` |
| `expenses` | Expense entries — category, amount, **mandatory** `receipt_image_url`, linked to `driver_id` + `vehicle_id` |
| `daily_summary` | Rollup table (revenue/expenses/net per driver per day) for fast reporting |
| `salary_calculations` | A calculated payout run for a vehicle + period (draft/finalized) |
| `salary_calculation_shares` | Each partner's share within a salary calculation |
| `audit_log` | Every edit to `rides`/`expenses` (old value, new value, who, when) |

Full column-level schema lives in the project's data model reference (see `driver-revenue-expense-pwa-plan.md`).

---

## 5. Key Design Decisions & Rationale

| Decision | Rationale |
|---|---|
| PWA, not native app | 100+ drivers need instant distribution and instant updates — no App Store/Play Store review cycle |
| Offline-first for drivers | Jeddah–Makkah–Madinah routes have signal gaps; a driver must never lose an entry for lack of connectivity |
| Mandatory receipt photo, enforced in UI **and** DB | UI rules can be bypassed by a direct API call; a `NOT NULL` constraint cannot |
| Same-day-only editing for drivers | Balances driver convenience (fix a typo minutes later) against data integrity (no rewriting last month's numbers unnoticed) |
| Audit log on every edit | Money is involved — every change must be traceable to a person and a time, no exceptions |
| Percentage split is per-vehicle, time-bounded | Splits can differ vehicle to vehicle and can change over time (renegotiation) without corrupting historical payout records |
| Partner scope enforced via RLS, not UI | A partner must be unable to see another vehicle's numbers even via a crafted API request — this has to be a database guarantee |
| Rollup table (`daily_summary`) instead of live aggregation only | At 100+ drivers logging daily over months/years, admin/partner dashboards need to stay fast — sum a rollup, not scan raw rows |

---

## 6. Non-Functional Requirements

- **Security:** RLS on every table; no client ever has broader access than its role requires. Receipt images in a private Storage bucket, signed URLs only.
- **Reliability:** Offline queue must survive app close/reopen (persisted in IndexedDB, not memory).
- **Performance:** Dashboard queries return in ~1–2 seconds even with 100+ drivers × months of daily entries — achieved via the rollup table and proper indexing, not by querying raw `rides`/`expenses` for reporting.
- **Auditability:** Every financial figure that changes after creation must be reconstructable — who changed it, from what, to what, when.
- **Currency:** Single currency (SAR) assumed unless specified otherwise — confirm before build.


## Driver Compensation (Corrected Model)

A driver is not automatically a 'partner' holding equity. Driver compensation is a distinct concept from partner equity (vehicle_partners).

**driver_compensation table**
- id (uuid, PK)
- driver_id (uuid, FK)
- vehicle_id (uuid, nullable)
- compensation_type (enum: commission, fixed_salary)
- commission_percentage (numeric, nullable)
- fixed_salary_amount (numeric, nullable)
- pay_frequency (enum: weekly, monthly)
- effective_from (date)
- effective_to (date, nullable)

Driver Pay calculation runs ALONGSIDE equity shares. If commission, pay = net_amount * (commission_percentage/100). If fixed_salary, pay = fixed_salary_amount.

