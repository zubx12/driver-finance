# Agent prompt: driver workspace + simpler admin navigation

Copy everything below the line into the agent. It is written for an agent that
has not seen our conversations. Version 2 (2026-10-05): merges the owner's
second draft (driver workspace tabs, global vs driver-level, filters, exports)
with the facts of the codebase, and corrects that draft where it did not match
the system's money rules (see section 9 at the end; the agent does not need it).

---

You are working in the **Driver Finance** codebase (repository root:
`driver-finance-app`), a live system for a transport company in Saudi Arabia.
Drivers log rides (cash or voucher) and expenses from a phone app (offline-first);
vehicles are owned by partners by percentage; the office (admin) finalizes monthly
vehicle payouts, settles cash with each driver monthly, and pays partners.

**The goal:** the admin should never need to leave a driver's page to understand
that driver. **Drivers → [driver]** becomes the driver's complete workspace.
Company-wide work stays in a small, grouped sidebar. Do not solve this by adding
pages: improve the structure.

## 0. Read first
1. `AGENTS.md` / `CLAUDE.md`: **Next.js 16** (App Router; `src/proxy.ts` instead of
   middleware). Check `node_modules/next/dist/docs/` when unsure. `'use client'` must be
   the **first line** of client files (some files start with a BOM or a comment).
2. `docs/payout-rules.md`, `docs/money-flow-plan.md`, `docs/driver-profile-plan.md`,
   `docs/admin-navigation-plan.md`, `docs/admin-dashboard-plan.md`.
3. `.agents/rules/` and `.agents/skills/supabase-rls-three-role/`.
4. The current database: `supabase/migrations/` (newest files last). **The current
   code and database are the source of truth**, not older specs such as `design.md`.

## 1. What already exists (reuse it; do not rebuild or duplicate it)
**Driver page** `src/app/admin/drivers/[id]/page.tsx`: month selector (Riyadh time),
vehicle card, partner split and this driver's pay terms *for the selected month*,
month totals, rides and expenses lists (who paid, vehicle, receipt via signed URL),
**Statement** (print / save as PDF) and **CSV** buttons, joining date with Edit
(`DriverEmployment`), Start leaving / Keep driver / Rejoin, Clearance card
(`DriverClearance`), assignment history (`AssignmentHistory`).
**The monthly report already downloads from the driver page.** Keep it working.

**Database functions to reuse** (do not recalculate these in the browser):
| Need | Function |
|---|---|
| Driver statement for a month: settlement + every cash ride, voucher collected, expense paid, handover, employment dates | `get_driver_statement(driver, month)` |
| Monthly settlement: opening, cash, vouchers, expenses paid by driver, pay, confirmed handovers, closing, paid, written off, carried, status | `get_driver_settlement(driver, month)`, `get_driver_settlements(month)` |
| Employment periods (joined, last working day, left, reason) | `get_driver_employment(driver)` |
| Clearance checklist | `get_driver_clearance(driver)` |
| Vehicle history | `get_assignment_history(vehicle, driver)` |
| Vehicle month report | `get_vehicle_month_report(vehicle, month)` |
| Vouchers handed to partners | `get_partner_vouchers(partner)` |
| Change history | `get_audit_log(p_table, p_record_id, p_from, p_to, ...)` |
| Month-end status | `get_month_close_status(month)` |
Front end: `src/lib/dates.ts` (`riyadhToday`, `monthOf`, `addDays`),
`src/lib/data/reports.ts`, `src/lib/data/settlements.ts`, `src/lib/csv.ts`
(`downloadCsv`, formula-safe, UTF-8 BOM), `src/components/SettlementBreakdown.tsx`,
`src/components/reports/*` (print-ready report views), `src/components/ui/*`.

## 2. Money rules (do not change; every figure must follow them)
- Dates: **Asia/Riyadh**, calendar months, end dates exclusive (`[from, to)`). Never the browser's time zone.
- **Rides** (`rides`): `payment_method` Cash / Voucher / Card / Transfer; vouchers have `payer_id` (table `payers`), `reference`, `payment_status` Outstanding / Collected / Received / Disputed / Cancelled, and `collected_by_name/role/at`. **There is no passenger, voucher number, issue date or due date**: do not invent them; show what exists.
- **Expenses**: `paid_by` driver / company / office; `allocation` Vehicle / Driver / Company; `review_status`; receipt path (open with a signed URL).
- **Vehicle payout** (per vehicle per month, `salary_calculations`): revenue − vehicle expenses − office expenses − charged expenses ± adjustments; **driver pay is calculated on the vehicle's net** (commission %, or salary + bonus) and paid **before** partners; the rest is split among partners by percentage. Driver pay counts only when the payout is **finalized**.
- **Driver settlement** (per driver per month): opening + cash rides + vouchers the driver collected − expenses with `paid_by = 'driver'` − driver pay − **confirmed** handovers = closing (positive: driver owes the office; negative: office owes the driver). Paid now / written off / carried forward.
- There is **no "company share" of a driver's revenue** and no "net revenue" that belongs to the driver. Do not show such figures. "Rides − expenses" may be shown only labelled "before driver pay".
- Vouchers belong to the vehicle's partners (7E); a driver collecting one counts as cash the driver holds.
- Driver status Active / Inactive / Suspended / Leaving / Left; Leaving and Left change only through `start_driver_leaving`, `approve_driver_clearance`, `rejoin_driver`.
- **Nothing with money is ever deleted** (a database rule blocks it). Finalized payouts and closed settlements are locked; never recalculate them.

## 3. Task A: driver workspace (tabs on the driver page)
Header: name, username, status badge, phone, joined date and time with the company,
last working day / left date and reason when set, current vehicle and since when,
current pay terms and since when, **balance with the office**, "also a partner"
when the driver's login is linked to a partner, last activity (latest entry),
account created. Actions: Statement (month), CSV, Excel, Edit, More (Start
leaving / Rejoin). Keep the existing look (cards, colours, typography).

Tabs (one month selector shared by all tabs; URL `?tab=…&month=YYYY-MM`):
1. **Overview**: month figures with change vs the previous month (▲▼ %):
   bookings, revenue (cash / voucher / card / transfer), expenses paid by the
   driver, driver pay (or "not finalized yet"), handovers, closing balance; a
   row this month / last month / year to date; a table of the last 12 months
   (click a month to select it); a small revenue trend chart.
2. **Rides**: every ride: date, vehicle, payment method, payer, reference,
   status, amount, notes, logged at. Filters: period (this month / previous /
   last 3, 6, 12 months / custom range), method, status, vehicle. Totals. Export.
3. **Expenses**: totals by category and by who paid; receipts attached vs missing;
   each expense with vehicle/allocation, review status, receipt. Filters. Export.
4. **Cash & vouchers**: cash collected, handed over (confirmed / waiting /
   disputed), still with the driver; vouchers **grouped by payer** (count,
   total, collected, outstanding) and each voucher with who collected it and
   when and which partner holds it. The page's "Outstanding" card links here.
5. **Settlements & pay**: each month's settlement (opening, closing, paid,
   written off, carried, status, closed date) using `get_driver_settlement`;
   pay per month from finalized payouts (commission / salary / bonus, base,
   days) and the pay-terms history.
6. **Reports**: the month's statement on screen with **Download PDF**,
   **Export Excel**, **Export CSV** (see section 6).
7. **History**: employment periods, vehicle assignments, audit log for this
   driver and their entries (who, what, old → new, when), corrections.

## 4. Task B: document expiry (owner decision)
Iqama and driving licence **expiry dates only** (no ID numbers, no scans); warn
**30 days** before; shown to the **office and the driver**; expired is a warning only.
- `driver_documents (driver_id, doc_type in ('iqama','driving_licence'), expires_on, unique (driver_id, doc_type))`, audited (`log_audit_changes`), written through an admin function; a driver reads only their own.
- Badges in the driver header + editor; filter on the Drivers list; banner in the driver app (`src/components/driver/DriverAccountGate.tsx`).

## 5. Task C: navigation (company-wide work only)
Driver-specific views live in the driver workspace, not in the sidebar.
Company-wide screens stay, grouped (no new menu items, no "Settings" page unless
it already exists):
```
Overview
Inbox (count)      tabs: Cash handovers · Expense review · Corrections
MANAGE   Drivers · Vehicles · Partners
FINANCE  Month End  tabs: Checklist · Payouts (salary runs) · Driver settlements · Partner settlements
         Vouchers (count)  tabs: Outstanding · Handed to partners
REPORTS  Reports    tabs: Vehicle monthly · Driver statements · Daily entries
SYSTEM   Audit log
```
- Move the existing screens into tabs **as they are**; each tab has its own URL;
  old URLs (`/admin/salary`, `/admin/handovers`, `/admin/settlements`,
  `/admin/driver-settlements`, `/admin/reports`, `/admin/month-close`,
  `/admin/outstanding`, `/admin/transactions`, `/admin/expense-review`,
  `/admin/corrections`) redirect to the new tab.
- Counts from **one** database call. Collapsible groups; the same menu on mobile.

## 6. Exports (one system, used everywhere)
- **CSV**: `src/lib/csv.ts` (keep formula protection and the BOM for Arabic).
- **Excel**: a real `.xlsx` (e.g. SheetJS `xlsx` or `exceljs`), built from the
  **same rows** as the CSV (one function producing rows, two writers).
- **PDF**: a one-click real PDF file with selectable text (not a screenshot), built
  from the same data as the screen (e.g. `@react-pdf/renderer` or `pdfmake`):
  company name (do not hardcode financial values; ask the owner for the exact
  company name and logo), driver, period, performance summary, payment methods,
  voucher summary, expenses by category, settlement (opening → closing, paid,
  written off, carried), detailed lists, generated at (Riyadh) and by whom.
  The existing print view (Statement button) stays as an alternative.
- Every export must show **the same totals as the screen** (test it).

## 7. How to work
- **Order:** C (navigation) → A (workspace: Overview → Rides → Expenses → Cash & vouchers → Settlements & pay → Reports + exports → History) → B (documents). Before coding each step, write a short change plan in the branch (`docs/`), then implement.
- One branch per step from `main`, one commit per step.
- **Data:** replace `src/app/api/admin/driver-detail/route.ts` (it uses the **service-role key** and bypasses row-level security) with admin-only database functions; then delete it. No service-role key in new code. Prefer **one call per tab**, computed in the database, reusing the functions above, so the dashboard, driver page, reports and exports cannot disagree.
- **Database changes:** a **new** file per step in `supabase/migrations/` named `YYYYMMDDHHMMSS_name.sql`, timestamp after the newest file. **Never edit an existing migration.** Functions: `SECURITY DEFINER`, `SET search_path = public, pg_temp`, `PERFORM public._require_admin();` (or `public.my_driver_id()` for a driver's own data), `REVOKE ALL ... FROM PUBLIC, anon`, `GRANT EXECUTE ... TO authenticated`. Backward compatible; never drop or rename tables/columns/functions in use.
- **Tests:** pgTAP files in `supabase/tests/database/<name>.test.sql` in the style of `driver_settlements.test.sql`. Test the **figures** against the existing functions (e.g. each 12-month row equals `get_driver_settlement` for that month; export rows sum to the screen totals) and **access** (another driver gets `42501`; a partner sees nothing of the driver).
- **Before every commit** all must pass: `npm test`, `npm run test:db` (all database tests on an in-memory Postgres), `npx tsc --noEmit`, `npx next build`; no new lint errors (`npx eslint <changed files>`). No `any`. Money as `SAR 1,234.00`. Sentence-case labels. Works on phone, tablet and desktop, and in dark mode.

## 8. Do NOT
- Do not run `supabase db push` or change the live database; do not push to `main`.
- Do not change payout, settlement, voucher or clearance calculations.
- Do not create a second audit system, revenue table or export system.
- Do not add menu items beyond section 5, or pages that are not in this prompt.
- Do not invent fields (passenger, voucher number, due date, driver code) without asking.

## 9. Report back after each step
Files changed, migration name, tests added with the summary lines of
`npm run test:db` and `npm test`, screenshots (desktop + phone), and anything
you could not do or assumed. The owner's reviewer checks the branch and applies
the migration before it is merged.

---

### Section 9 (for the owner, not the agent): corrections to the second draft
1. Its settlement example ("Net revenue 10,510, driver commission 35% = 3,678.50,
   company share 6,831.50, paid 3,000, remaining 678.50") is **not how this system
   pays**: commission is on the **vehicle's** net, driver pay comes before the
   **partners** (there is no company share), and the driver's settlement is cash
   based. Building it would show wrong money.
2. "Net revenue" for a driver: removed (it misleads); "before driver pay" only.
3. Voucher passenger / number / issue and due dates and "DRV-00042" codes do not
   exist; the agent must not invent them (ask first).
4. "Settings" and "Audit / Corrections" pages: Settings does not exist; Corrections
   is a review queue (Inbox), the audit log stays under System.
5. It told the agent to inspect everything from scratch and missed what is
   already built (the driver page already downloads the statement) and the
   project's test and migration rules; both are now in the prompt.
