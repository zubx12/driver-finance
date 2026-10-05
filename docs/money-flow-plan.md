# Money Flow Plan: who earns what, and where the money is

Status: **Decisions recorded, ready to build** (2026-10-04). Builds on
[payout-rules.md](payout-rules.md) (what each person earns, already built and
tested).

## 1. The owner's rules

**Payout split (built).** Revenue for the month, minus expenses paid by the
driver, minus office expenses, minus the driver's pay; the remaining balance is
shared between the partners by percentage. Example G (automated test):

| Line | SAR |
|---|---|
| Revenue for the month | 9,000 |
| − Expenses paid by the driver | −2,000 |
| − Office expenses | −1,000 |
| − Driver pay (none in this example) | 0 |
| **= Balance to share** | **6,000** |
| Partner A, 60% | 3,600 |
| Partner B, 40% | 2,400 |

**Decisions (owner, 2026-10-04)**

| # | Decision |
|---|---|
| M1 | Driver pay (commission or salary) comes out **before** the partners' share. |
| M2 | The driver is **cleared every month**. Vouchers not yet collected at month end are **handed to the partner** as part of their payout; the office keeps the record of every voucher. The office can **print a full monthly report for every vehicle**: revenue (cash and vouchers), all expenses, payouts. |
| M3 | Partners and drivers can change vehicle in the middle of a month. When the office makes the change, **every record keeps its date**: who drove or owned which vehicle, from when to when. |
| M4 | The driver keeps their pay from the cash in hand. If the cash is **more** than their pay, the office receives the rest. If it is **less**, the office pays the driver the difference, either now or later (e.g. next month). |

Ownership changes inside a month keep the split by days owned (payout-rules
D1), which follows from M3: each record keeps its dates and the month is split
by them.

## 2. The driver's monthly settlement (M2 + M4)

Every month each driver gets one settlement: what they collected, what they
spent, what they earned and what they handed over, and the balance between
them and the office.

```
  Opening balance           (carried from last month; + driver owes office, − office owes driver)
+ Cash collected            (cash rides)
+ Vouchers the driver collected in cash
− Expenses the driver paid from the cash
− Driver pay for the month  (commission / salary + bonus, from the finalized payout)
− Cash handed over          (confirmed by the office)
= Closing balance
    > 0  the driver hands this to the office
    < 0  the office owes the driver this amount
```

At month end the office closes it with one of:
- **Settled now**: the driver hands over / the office pays the driver (with reference);
- **Carried forward**: the balance becomes next month's opening balance.

Worked examples:

| | Case 1: cash more than pay | Case 2: cash less than pay |
|---|---|---|
| Driver pay | Commission 1,800 | Salary 4,000 |
| Opening balance | 0 | 0 |
| + Cash collected | 7,000 | 3,000 |
| − Expenses paid from cash | −2,000 | −500 |
| − Driver pay kept | −1,800 | −4,000 |
| − Handed over during the month | −3,000 | 0 |
| **= Closing balance** | **+200**: driver hands 200 to the office | **−1,500**: office owes the driver 1,500, pays now or next month |

A driver who changes vehicle mid-month still has **one** settlement: their
entries from both vehicles are included, each with its own vehicle and date.

## 3. Vouchers handed to partners (M2)

Vouchers still uncollected at month end belong to the vehicle's month and are
part of the partners' balance (they were counted as revenue). The partner
**takes** them: the office pays the partner in cash only the part already
received, and the partner collects the vouchers.

Example: a partner's share is 3,600 and 500 of that vehicle's vouchers are
uncollected. The office pays **3,100 in cash** and hands over **500 in
vouchers** (listed one by one: date, payer, reference, amount). When the
partner collects one, they mark it collected (this already exists) and the
record shows who collected it and when.

**Two or more partners on one car (owner, 2026-10-04: option a):** each
uncollected voucher stays shared by the partners' percentages for that month.
When it is collected, the money is split the same way, so no partner is left
holding a voucher that is never paid.

## 4. Assignment history (M3)

- Partner ownership and driver pay terms already keep from/to dates.
- **Missing:** which driver drove which vehicle when. Today only the current
  vehicle is stored. A `driver_vehicle_assignments` table (driver, vehicle,
  from, to) will be written whenever the office assigns or moves a driver, and
  shown on the vehicle and driver pages ("Ali: 1-14 Oct on Camry, 15 Oct onward
  on Staria").
- Every ride and expense already stores its own vehicle and date, so totals stay
  correct after a move.

## 5. Monthly vehicle report (M2)

A print-ready page per vehicle per month (Print / Save as PDF, plus CSV):

1. Owners in the month, with dates and percentages; drivers in the month, with dates.
2. Revenue: cash and vouchers, by day.
3. Vouchers: each one with date, payer, reference, amount, status, who collected it.
4. Expenses: each one with who paid (driver cash / company / office), category, receipt link.
5. Office expenses, charged expenses and corrections (adjustments).
6. Driver pay and how it was calculated.
7. Balance to share and each partner's share: paid in cash + vouchers handed over.

A matching **driver statement** shows the settlement in §2.

## 6. Build plan (Phase 7: money flow)

Each step: database migration + tests, then screens, then build + commit.

| Step | What | Depends on |
|---|---|---|
| **7A** | Assignment history table, written by assign/unassign, backfilled from today's assignments; history shown on vehicle and driver pages | – |
| **7B** | Cash handovers on the server: the driver submits (offline-safe), the office confirms or disputes; audited | – |
| **7C** | "Who paid" on every expense (driver cash / company card or transfer / office) | – |
| **7D** | Driver monthly settlement: calculation (§2), office screen to settle or carry forward, carried balances, driver can see their own | 7A, 7B, 7C, finalized payouts |
| **7E** | Vouchers handed to partners: cash part vs voucher part on each partner settlement, voucher list attached; shared vouchers split by percentage when collected | 7D |
| **7F** | Monthly vehicle report and driver statement (print/PDF/CSV) | 7A-7E |
| **7G** | Month-end close: an order and a checklist. Finalize vehicle payouts → settle drivers → pay partners; warnings for unconfirmed handovers, drivers holding cash, unreviewed expenses | 7D, 7E |

Status (2026-10-05): 7A, 7B done (PR #1); 7C, 7D done (PR #2); 7E done (PR #3);
7F done on branch feat/money-flow-7f: Monthly Reports in the admin menu
(vehicle report or driver statement per month, Print / Save as PDF, CSV) and
"My Statement" for drivers, opened from the settlement card on the Cash screen.
The vehicle report is for the office only; partners keep their own screens.
7G done on branch feat/money-flow-7g: Month-End Close in the admin menu. Steps
in order (0 review handovers and driver/company expenses, 1 finalize payouts,
2 settle drivers, 3 pay partners), each linking to its screen; the office
signs the month off when nothing is open, and can reopen it with a reason.
Vouchers owed to partners are shown as information (they can be from any month).

Rules settled while building 7E:
- Vouchers are handed over **when the office pays the partner's share**: those
  of that vehicle-month still uncollected at that moment. Each partner gets
  voucher × their percentage of the month; the rest of the share is paid in cash.
- If the partner's part of the vouchers is more than their share (a month with
  heavy expenses), the office keeps the vouchers and pays the share in cash.
- A handed voucher collected by anyone other than the partner (driver, office,
  another partner) shows as **owed to the partner**; the office pays that part
  out and records it. When one partner collects a shared voucher, the other
  partners' parts are owed to them the same way (the office settles it).
- Partner shares can be paid only through `pay_partner_settlement()`; the old
  service-role API route was removed.

Rules settled while building 7C/7D:
- **Who paid** is `driver` (cash in hand, or the driver's own money/card, which
  the office repays), `company` (company card / transfer) or `office`. Older
  app versions that do not send it get `driver` for cash and `company` otherwise.
- A month can be settled only after it has ended, every vehicle payout with the
  driver's rides, expenses or pay is **finalized**, and every handover in it is
  **reviewed**. Months settle in order.
- At settlement the office records what is paid now (either direction, cash or
  bank transfer, with a reference); the rest is carried to next month.
- A settled month **locks** what it counted: cash rides, vouchers the driver
  collected, driver-paid expenses and handovers. The latest settled month can be
  reopened with a reason (kept in the audit log).

Then the remaining usability work and Phase 8 (lint backlog, pilot).

## 7. Before any of this goes live

Staging, the production damage queries and the release steps in
[deployment-runbook.md](deployment-runbook.md) still come first: the payout
fixes from Phases 1-5 are not deployed yet.
