# Money Flow Plan: who earns what, and where the money is

Status: **Draft for owner review** (2026-10-04). Builds on
[payout-rules.md](payout-rules.md) (what each person earns, already built).

## 1. The owner's rule (confirmed 2026-10-04)

> Revenue for the month, minus the expenses paid by the driver, minus the
> expenses added by the office; the remaining balance is shared between the
> partners by their percentage. Most expenses are paid by the driver from the
> cash in hand.

This is what the payout engine does today. Example (now an automated test,
"Example G"):

| Line | SAR |
|---|---|
| Revenue for the month | 9,000 |
| − Expenses paid by the driver | −2,000 |
| − Expenses added by the office | −1,000 |
| **= Balance to share** | **6,000** |
| Partner A, 60% | 3,600 |
| Partner B, 40% | 2,400 |

If the driver is paid by commission or salary, that pay is taken out before
the partners' share, the same way as an expense (payout-rules.md, D2/D8).

## 2. What is missing: where the money physically is

The split answers "how much does each partner earn". It does not answer
"where is the cash", which matters because the driver pays expenses out of
the cash they collect. Using the same month, with revenue taken as 7,000 cash
and 2,000 vouchers:

| Driver's cash in hand | SAR |
|---|---|
| Cash collected from passengers | +7,000 |
| Vouchers the driver collected (say 1,500 of 2,000) | +1,500 |
| − Expenses the driver paid in cash | −2,000 |
| − Cash handed over to the office during the month | −5,000 |
| **= Cash the driver still holds** | **1,500** |

| Office side | SAR |
|---|---|
| Cash received from the driver | 5,000 |
| − Office expenses paid | −1,000 |
| − Partner payouts | −6,000 |
| Still to come in: driver's cash 1,500 + vouchers not yet collected 500 | +2,000 |
| **= Balance once everything is collected** | **0** |

Today the server cannot produce either table: **cash handovers are stored only
on drivers' phones**, and voucher collection is recorded but not linked to who
holds the money. That is why the partner "Driver Cash" page says
"not available yet".

## 3. Decisions needed from the owner

| # | Question | Options | Recommendation |
|---|---|---|---|
| M1 | Driver pay (commission/salary) comes out before the partners' share? | Yes / No (paid by the company separately) | **Yes** (built today) |
| M2 | Vouchers not collected by month end | (a) count in the month they were earned, pay partners now; (b) count only when collected | **(a)** with the uncollected amount shown on the statement; switching to (b) changes the engine and every past month |
| M3 | Ownership changes in the middle of a month (D1) | By days owned / by income on each day | **By days owned** (built today) |
| M4 | How is the driver's own pay handed over? | Office pays the driver / driver keeps it from the cash in hand | Decides whether driver pay appears in the cash table |

## 4. Plan (proposed Phase 7: money flow)

Each step is a database migration with tests, then screens, then a commit.

**7A. Cash handovers on the server**
- `cash_handovers` table: driver, vehicle, amount, date, method (cash / bank
  transfer), reference, `status` (`submitted` by the driver → `confirmed` by
  the office, or `disputed`), audited.
- Driver app: the existing handover form syncs through the same offline sync
  engine (no duplicates, retries, never lost at sign-out).
- Office: a "Handovers to confirm" screen. Only confirmed handovers reduce
  the driver's cash in hand.

**7B. Driver cash position**
- Database function: cash collected + vouchers the driver collected − cash
  expenses − confirmed handovers (− pay kept by the driver, if M4 says so),
  per driver, for any period, with an opening balance carried from earlier
  months.
- Office: "Cash in hand" screen, all drivers, sorted by who holds the most.
- Driver app: the same figure on the Cash screen, so both sides see one number.
- Partner "Driver Cash" page: real figures for their vehicles.

**7C. Who paid each expense**
- Make it explicit on every expense: *paid by driver cash*, *paid by company
  card/transfer*, *office expense*. Only driver-cash expenses reduce the cash
  in hand; all of them still reduce the balance to share (rule in §1).

**7D. Monthly statement**
- One page per vehicle per month (screen + PDF/CSV): §1 table, driver pay, each
  partner's share, and the §2 cash position, including vouchers still to
  collect. The office can send it to partners with the payout.

**7E. Month-end checks before finalizing**
- Finalizing a month warns when: a driver still holds cash above a limit,
  handovers are unconfirmed, or vouchers are uncollected (M2).

Then the remaining items from the original Phase 7 (usability) and Phase 8
(lint backlog, pilot).

## 5. Before any of this goes live

Staging, the production damage queries and the release steps in
[deployment-runbook.md](deployment-runbook.md) still come first: the
payout fixes from Phases 1–5 are not deployed yet.
