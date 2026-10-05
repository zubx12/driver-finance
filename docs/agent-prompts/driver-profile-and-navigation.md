# Agent prompt: complete driver profile + simpler admin navigation

Copy everything below the line into the agent. It is written for an agent that
has not seen our conversations. Written 2026-10-05 against `main` after PR #8
(and branch `feat/driver-rejoin`, L4, if merged).

---

You are working in the **Driver Finance** codebase (repository root:
`driver-finance-app`). It is a live system for a transport company in Saudi
Arabia: drivers log rides (cash or voucher) and expenses from a phone app;
vehicles are owned by partners by percentage; the office (admin) runs monthly
payouts, settles cash with drivers and pays partners.

## 0. Read first (do not skip)
1. `AGENTS.md` and `CLAUDE.md`. This is **Next.js 16** (App Router, `src/proxy.ts`
   instead of middleware). Read the guide in `node_modules/next/dist/docs/` for
   anything you are unsure about. `'use client'` must be the **first line** of
   client files (some files start with a BOM or a comment; keep the directive first).
2. `docs/payout-rules.md`, `docs/money-flow-plan.md`, `docs/driver-profile-plan.md`,
   `docs/admin-navigation-plan.md`, `docs/admin-dashboard-plan.md`.
3. `.agents/rules/` (financial-data-integrity, security-policy) and
   `.agents/skills/supabase-rls-three-role/`.

## 1. What already exists (reuse it; do not rebuild it)
**Driver page** `src/app/admin/drivers/[id]/page.tsx` already has: month selector
(Riyadh time), vehicle card, partner split and this driver's pay terms *for the
selected month*, month totals, rides and expenses tabs (who paid, vehicle,
receipts via signed URL), **Statement** button (opens `/admin/reports?kind=driver&driver=<id>&month=YYYY-MM`)
and **CSV** download, employment line with joining date (`DriverEmployment`),
Start leaving / Keep driver / Rejoin, Clearance card (`DriverClearance`),
assignment history (`AssignmentHistory`).
**So "the monthly report does not download from the driver page" is already
fixed** (the screenshot that reported it was taken before the fix). Verify it
works; do not rebuild it.

**Database functions to reuse** (all in `supabase/migrations/`):
| Need | Function |
|---|---|
| Driver statement for a month (settlement + every ride, voucher, expense, handover, employment dates) | `get_driver_statement(driver, month)` |
| Monthly settlement (opening, cash, vouchers, expenses, pay, handovers, closing, status) | `get_driver_settlement(driver, month)`, `get_driver_settlements(month)` |
| Employment periods, joining / leaving | `get_driver_employment(driver)` |
| Clearance checklist | `get_driver_clearance(driver)` |
| Vehicle history | `get_assignment_history(vehicle, driver)` |
| Vehicle month report | `get_vehicle_month_report(vehicle, month)` |
| Vouchers handed to partners | `get_partner_vouchers(partner)` |
| Change history | `get_audit_log(...)` |
| Month-end status | `get_month_close_status(month)` |
**Front-end helpers:** `src/lib/dates.ts` (`riyadhToday`, `monthOf`, `addDays`),
`src/lib/data/reports.ts`, `src/lib/data/settlements.ts`, `src/lib/csv.ts`
(`downloadCsv`, formula-safe), `src/components/SettlementBreakdown.tsx`,
`src/components/reports/*`, `src/components/ui/*` (Card, Button, Input, Tabs).

## 2. Business rules you must keep
- All dates are **Asia/Riyadh**; months are calendar months; end dates are exclusive (`[from, to)`).
- Driver pay counts only from **finalized** payouts (`salary_calculations.status = 'finalized'`).
- Driver settlement: opening + cash rides + vouchers the driver collected − expenses with `paid_by = 'driver'` − driver pay − **confirmed** handovers = closing.
- Expense "who paid": `paid_by` = driver / company / office.
- Vouchers belong to the vehicle's partners (by percentage); a driver collecting one counts as cash in hand.
- Driver status: Active, Inactive, Suspended, **Leaving**, **Left**. Leaving/Left change only through `start_driver_leaving`, `approve_driver_clearance`, `rejoin_driver`.
- **Nothing with money is ever deleted** (a database rule blocks it).
- Every figure you show must equal the same figure on Monthly Reports, Driver Settlements and Salary Runs.

## 3. Task A: complete driver profile (docs/driver-profile-plan.md P2-P6)
Turn the driver page into a complete record **using the existing look**
(card layout, colours, typography already on the page). Do not restyle what is there.

1. **Data (P2):** replace `src/app/api/admin/driver-detail/route.ts` (it uses the
   **service-role key** and bypasses row-level security) with one admin-only
   database function, e.g. `get_driver_profile(driver, month)`, `SECURITY DEFINER`,
   `SET search_path = public, pg_temp`, starting with `PERFORM public._require_admin();`,
   that returns everything the page needs in one call. Then delete the route.
2. **Header (P3):** name, username, phone, status badge, joined date and time
   with the company, last working day / left date when set, current vehicle and
   since when, current pay terms and since when, **balance with the office**
   (latest settlement), Statement and CSV buttons (already there).
3. **Overview tab (P3):** the selected month vs the previous month (bookings
   count, revenue split cash / voucher, expenses paid by the driver, driver pay,
   handovers, closing balance), a **this month / last month / year to date** row,
   and a **12-month table** (one row per month; click a month to select it).
4. **Bookings tab (P4):** every ride with date, vehicle, cash/voucher, payer,
   reference, status; filters (cash/voucher/status/vehicle); totals.
5. **Vouchers tab (P4):** grouped **by payer**: count, total, collected,
   outstanding; each voucher with who collected it and when, and which
   partner holds it (from the `partner_voucher_shares` data). The existing
   "Outstanding" card must link to this tab.
6. **Expenses tab (P5):** by category and by who paid; vehicle, receipt, review status.
7. **Cash & settlement tab (P5):** handovers with status; each month's
   settlement (opening, closing, paid, written off, carried).
8. **Pay tab (P5):** pay per month from finalized payouts (commission / salary /
   bonus, base, days); pay-terms history.
9. **History tab (P6):** assignment history (move the existing panel here) and
   the audit log for this driver.

## 4. Task B: document expiry (docs/driver-profile-plan.md §7, DOC1-DOC2)
Owner decision: keep **Iqama** and **driving licence** expiry **dates only**
(no ID numbers, no scans), warn **30 days** before, show the warning to the
**office and the driver**; expired is a warning only (does not block anything).
- Table `driver_documents (driver_id, doc_type in ('iqama','driving_licence'), expires_on, unique (driver_id, doc_type))`, audited (`log_audit_changes` trigger), RLS: admin reads/writes through a function, a driver reads only their own.
- Admin: badges in the driver header (valid / expires in N days / expired) and an editor; a filter on the Drivers list.
- Driver app: banner from 30 days before ("Your Iqama expires in 12 days. Renew it and tell the office."), red when expired. Use the existing banner place (`src/components/driver/DriverAccountGate.tsx`).

## 5. Task C: navigation (docs/admin-navigation-plan.md, N1-N3)
From 15 menu items to **8**: Overview · **Inbox** (Cash handovers · Expenses ·
Corrections) · Drivers · Vehicles · Partners · **Vouchers** (Outstanding ·
Handed to partners) · **Month End** (Checklist · Payouts · Driver settlements ·
Partner settlements · Reports, one month selector shared by the tabs) ·
**Records** (Daily entries · Audit log). Grouped as Manage / Money / Records.
- Move the existing screens into the tabs **as they are**; do not rewrite their logic.
- Each tab has its own URL (`?tab=…&month=…`); old URLs redirect to the new tab.
- Counts on Inbox and Vouchers (menu and tabs) from **one** database call.
- **Do not add any other menu item.** New features become tabs or sections.

## 6. How to work
- **Order:** C (navigation) → A (profile: P2, P3, P4, P5, P6) → B (documents). One branch per step from `main`, one commit per step.
- **Database changes:** one **new** file per step in `supabase/migrations/` named `YYYYMMDDHHMMSS_name.sql` with a timestamp after the newest existing file. **Never edit an existing migration.** Functions: `SECURITY DEFINER`, `SET search_path = public, pg_temp`, `REVOKE ALL ... FROM PUBLIC, anon` then `GRANT EXECUTE ... TO authenticated`; admin checks with `public._require_admin()`; driver access with `public.my_driver_id()`.
- **Tests:** add pgTAP tests in `supabase/tests/database/<name>.test.sql` (copy the style of `driver_settlements.test.sql`: `BEGIN; ... SELECT plan(n); ... SELECT * FROM finish(); ROLLBACK;`). Test the figures against the existing functions (e.g. 12-month totals equal `get_driver_settlement` for each month) **and** access: a driver sees only their own data, another driver gets `42501`, a partner gets nothing.
- **Before every commit**, all must pass: `npm test`, `npm run test:db` (runs every database test on an in-memory Postgres), `npx tsc --noEmit`, `npx next build`. Add no new lint errors (`npx eslint <changed files>`).
- No service-role key in new code. No `any`. Money format `SAR 1,234.00`. Sentence-case labels.

## 7. Do NOT
- Do not run `supabase db push` or change the live database. Do not push to `main`.
- Do not delete or rename existing database functions, tables or columns.
- Do not change payout, settlement or voucher calculations.
- Do not restyle existing sections or add menu items.

## 8. Report back after each step
What you changed (files), the migration name, the tests added and their
results (paste the summary lines of `npm run test:db` and `npm test`), and
anything you could not do or had to assume. The owner's reviewer will check
the branch and apply the migration before it is merged.
