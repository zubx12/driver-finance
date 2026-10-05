# Driver profile (admin): plan for a complete driver record

Owner request (2026-10-05): when the office opens a driver, everything about
that driver should be there: joining date, leaving date, bookings this month
and previous months, cash and voucher bookings, voucher payers, the monthly
statement to download, and every other setting and figure, professionally.

Reviewed: `src/app/admin/drivers/[id]/page.tsx` (547 lines),
`src/app/api/admin/driver-detail/route.ts`, the drivers table and the live page.

## 1. What is wrong or missing today

### Bugs
| # | Problem |
|---|---|
| P-B1 | **Pay terms can belong to another driver.** "Driver Compensation" is looked up by vehicle only (no driver filter): with two drivers on a car it shows whichever row comes first, or nothing. |
| P-B2 | **Partner split and pay terms are always today's**, even when an earlier month is selected. A month in which the car had different owners or rates shows the wrong ones. |
| P-B3 | The data comes through an API route using the **service-role key** (full access, skips the database's security rules), the same pattern removed from partner payments in 7E. |
| P-B4 | "Net Revenue" on a driver page is the vehicle's figure before driver pay; it is not the driver's money and is easy to misread. |
| P-B5 | The month list uses the computer's clock, not Riyadh time (wrong month around midnight on the 1st). |
| P-B6 | Expenses do not show who paid (7C), review status or which vehicle. |

### Missing
- **Joining date, leaving date, reason for leaving**: the database has none (only
  "created at" and a status).
- **Download the monthly statement** from the driver's page (it exists since 7F,
  under Monthly Reports, but not here).
- **Month by month**: bookings, cash, vouchers, expenses, pay and handovers for
  the last 12 months, with this month compared to the previous one.
- **Vouchers by payer**: how many and how much each payer (hotel, company)
  gave this driver, what is outstanding, who collected.
- **Settlement history** (7D), **pay history** (finalized payouts),
  **pay terms history**, **change history** (audit log) for this driver.

## 2. Target: the driver record

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ← Khadim Hussain  @khadim12  ● Active            [Statement ▾] [Edit] [⋯] │
│ Joined 24 Aug 2026 (1 month) · Phone · Toyota Hiace 9583 LRA since 1 Sep   │
│ Pay: 35% commission (since 1 Sep) · Balance with office: owes SAR 1,200    │
├───────────────────────────────────────────────────────────────────────────┤
│ [Overview] [Bookings] [Vouchers] [Expenses] [Cash & settlement] [Pay]     │
│ [Vehicles] [History]                                  Month: [Oct 2026 ▾] │
├───────────────────────────────────────────────────────────────────────────┤
│ Overview: Bookings 42 (▲5) · Revenue 21,000 (cash 17,500 / vouchers       │
│ 3,500) · Expenses paid 1,900 · Pay 6,400 · Handed over 12,000             │
│ Month by month (12 months): bookings · cash · vouchers · expenses · pay · │
│ handed over · closing balance · settled?   (click a month to open it)     │
└───────────────────────────────────────────────────────────────────────────┘
```

| Tab | Contents |
|---|---|
| **Overview** | Month figures with change vs previous month; 12-month table; current balance with the office |
| **Bookings** | Every ride: date, vehicle, cash/voucher, payer, reference, status; filters; totals |
| **Vouchers** | By payer: count, amount, collected, outstanding; each voucher with who collected it and when, and which partner holds it (7E) |
| **Expenses** | By category and by who paid; each with vehicle, receipt, review status |
| **Cash & settlement** | Handovers with status; each month's settlement (opening, closing, paid, carried) |
| **Pay** | Pay per month from finalized payouts (commission / salary / bonus, how calculated); pay terms history |
| **Vehicles** | Assignment history (exists, moved here) |
| **History** | Every change to this driver and their entries (audit log) |

**Statement button**: this month or any month, as Print / PDF / CSV (reuses 7F).
**Leaving**: "Mark as left" asks for the leaving date and reason, ends the
vehicle assignment and pay terms on that date, blocks the login, and keeps
every record. "Rejoin" adds a new joining period.

## 3. Build plan

| Step | What | Size |
|---|---|---|
| **P1 Fix + quick wins** | P-B1, P-B2, P-B5, P-B6; **Statement button** (Print / PDF / CSV) on the driver page | ½ day |
| **P2 Data foundation** | Joining / leaving dates and reason (existing drivers: joining date = account creation date, editable); "Mark as left" / "Rejoin"; one admin-only database function for the driver record replacing the service-role route (P-B3, P-B4); database tests | 1 day |
| **P3 Header + Overview** | Header with dates, vehicle, pay terms, balance; summary row this month / last month / year to date; 12-month table (each month clickable) | 1 day |
| **P4 Bookings + Vouchers** | Ride list with filters; voucher-payer breakdown and voucher list | 1 day |
| **P5 Expenses, Cash, Pay** | The three tabs from settlement, handover and payout data (all already in the database) | 1 day |
| **P6 Vehicles, History, polish** | Assignment history and audit tab; phone layout; print; empty and error states | ½ day |

About 5 days, step by step, each tested. Every figure must equal the same figure
on Monthly Reports, Driver Settlements and Salary Runs (checked by database tests).

## 4. Already settled (checked 2026-10-05)
- **"Report does not download" on this page**: there is no download on the driver
  page at all; the statement download exists only under Monthly Reports →
  Driver statement (7F). P1 adds it here. The October page shows 0 correctly:
  this driver's only rides are in August (2, SAR 1,000) and September (1, SAR 500).
- **Vehicle changes**: real (owner decision M3); the dated history already exists
  (7A, `driver_vehicle_assignments`) and is shown at the bottom of the page.
- **Voucher payers**: real records in the `payers` table, not free text.

## 5. When a driver leaves (offboarding)

Owner rule (2026-10-05): when a driver leaves, nothing about their money is
deleted, and the driver is not fully closed until **the office approves that
every payment is clear**.

### Found while checking (must fix first)
The database deletes a driver's rides, expenses, settlements and pay records
**automatically if the driver row is deleted** (`ON DELETE CASCADE`, also for
vehicles and partners). The app has no Delete button today, but the database
allows it to an admin. **L0** below closes this.

### The three stages
```
Active ──"Start leaving"──▶ Leaving ──all checks clear + office approves──▶ Left
  ▲                          (can still sync)                     (login blocked)
  └──────────────────────────────── "Rejoin" (new period) ◀────────────┘
```
1. **Start leaving** (office): last working day and reason. From that day the
   driver cannot add new entries dated after it, but **can still log in to
   upload entries waiting on their phone** and see their statement. The vehicle
   assignment and pay terms end on the last working day (dated history, 7A).
2. **Clearance checklist** (automatic, shown on the driver's page), every line
   must be green:
   - entries waiting on the phone: the driver has synced (last sync after the last working day)
   - every cash handover confirmed or disputed and resolved
   - payouts finalized for every vehicle-month the driver worked
   - every monthly settlement closed, including the leaving month
   - **final balance zero**: the last settlement cannot be carried forward
     (there is no next month); it is paid now in either direction, or the
     office writes off a remainder with a reason (recorded and audited)
   - open correction requests answered
   - (information) vouchers from the driver's rides still outstanding: they
     belong to the vehicle and its partners (7E), so they do not block clearance
3. **Approve clearance** (office): shows the final statement (Print / PDF),
   the office confirms "all payments clear". Only then: status **Left**, login
   blocked, and a clearance record kept (who, when, final balance, any write-off).

**Nothing is ever deleted.** All rides, expenses, handovers, settlements and
statements stay visible on the driver's page and in reports. **Rejoin** starts a
new employment period: same driver record, old history kept.

### Build steps
| Step | What | Size |
|---|---|---|
| **L0 Protect records** | Database rule: a driver, vehicle or partner with any money record cannot be deleted (use Left / Inactive instead); test it | ½ day |
| **L1 Employment record** | Joining date, last working day, left date, reason, status Active / Leaving / Left; employment periods for rejoining; audited | ½ day |
| **L2 Leaving rules** | Block new entries dated after the last working day; driver login allowed while Leaving, blocked when Left (checked by the database, not only the app) | ½ day |
| **L3 Clearance** | Checklist function and screen on the driver's page; final settlement must be paid or written off with a reason; "Approve clearance" only when all lines are clear | 1 day |
| **L4 Rejoin and reports** | Rejoin; "Left drivers" filter on the Drivers list; joining / leaving dates on statements | ½ day |

L0-L4 replace "Mark as left" in P2 and are tested like the money-flow steps
(about 3 days).

## 6. Decisions for the owner
1. **Existing drivers' joining date**: use the account creation date, and the
   office corrects it if needed (recommended).
2. **When a driver leaves**: decided (§5): Leaving → clearance approved by the
   office → Left; records kept forever; rejoining possible.
3. **Documents**: decided (2026-10-05): keep Iqama and driving licence
   **expiry dates** (dates only, no ID numbers), warn 30 days before, and show
   the warning to the **driver** as well as the office. See §7.
4. **Order**: decided: P1 + dashboard D1 first (done on branch
   feat/admin-polish-p1-d1), then L0 (protect records), then the rest.

## 7. Document expiry (Iqama, driving licence)

Owner decision (2026-10-05): keep the expiry dates, warn 30 days ahead, and
show the warning to the driver too.

- **Stored**: one row per driver and document type (Iqama, driving licence;
  more types can be added later) with the expiry date. Dates only: no ID
  numbers or scans. The office enters and updates them on the driver's page;
  every change is in the audit log.
- **Office**: on the driver's page header, a badge per document (valid /
  expires in N days / expired); on the dashboard's "Needs your action" strip,
  "2 documents expiring in 30 days"; a filter on the Drivers list.
- **Driver**: a banner in the driver app, "Your Iqama expires in 12 days.
  Renew it and tell the office.", from 30 days before until it is updated;
  red once expired. The driver can see their own dates but not change them.
- **Expired documents** are a warning only (they do not block the driver's
  login or entries) unless the owner later decides otherwise.

| Step | What | Size |
|---|---|---|
| **DOC1** | Table + office editing on the driver page + badges; database test that a driver sees only their own dates | ½ day |
| **DOC2** | Driver-app banner; dashboard action item and Drivers list filter (with D2) | ½ day |
