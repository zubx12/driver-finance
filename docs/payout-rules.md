# Payout Rules (Phase 2 specification)

Status: **Implemented** in `supabase/migrations/20260930000002_payout_engine.sql`,
tested by `supabase/tests/database/payout_engine.test.sql` (2026-09-30).
The D1 weighting method below was refined during implementation — owner to confirm.

These rules define how the salary calculation engine splits a vehicle's money
between drivers and partners. They are the specification the Phase 2 engine and
its tests are written against. Changing a rule later means changing the engine
and re-running its tests.

## Definitions

- **Vehicle net** for a day = that vehicle's revenue − that vehicle's expenses
  (from `daily_summary`), for rows attributed to the vehicle.
- **Period** = one calendar month (1st to last day), Asia/Riyadh dates.
- **Segment** = a run of consecutive days inside the period where the vehicle's
  partner splits and a driver's pay terms do not change.

## D1 — Changes in the middle of a month: pro-rate by day

Splits and driver pay terms are applied to the days they were actually in force.

- Partner shares: a partner's percentage for the month is the **average of
  their daily percentage over the month's days** (percentage × days owned ÷ days
  in month). The month's partner pool is split by these percentages.
  (Weighting by each day's income instead was rejected: a partner who owned the
  car only during a loss-making week would get a negative share inside a
  profitable month, which conflicts with D2.)
- Days on which a vehicle has no partners at all send their part of the pool to
  "company retained".
- Commission: calculated on the driver's net for each segment (see D8), using
  that segment's commission rate.
- Fixed salary: `monthly salary × (days the terms were in force ÷ days in month)`.
- Effective dates are half-open: a row with `effective_from = 10th` and
  `effective_to = 20th` covers the 10th through the 19th. A new row starting the
  20th takes over with no overlap and no gap.

## D2 — Negative net

- Commission is never negative: a segment with negative driver net earns 0
  commission (no claw-back from the driver).
- Bonus (for salaried drivers) is 0 when the driver's net is not positive.
- Fixed salary is always owed in full (pro-rated per D1).
- If the amount left for partners is negative, partner shares for the month are
  **0**, and the loss is **carried forward**: it is deducted from the vehicle's
  partner pool in the next month(s) until recovered. Partners are never asked
  to pay cash back through the system.
- The carried-forward amount is stored on the calculation so it is visible and
  auditable.

## D3 — Pay frequency

- Payout calculations run for **calendar months only**. Custom or weekly
  periods are not supported by the engine (removes overlap and double-counting
  risk).
- `pay_frequency` is stored but treated as `monthly`. Weekly cash given to a
  driver is recorded as an **advance** and deducted from their monthly pay
  (advances are a later phase).

## D4 — Rounding

- All maths is done in Postgres `numeric` (no floating point).
- Each amount is rounded to 2 decimal places.
- Leftover cents after rounding partner shares go to the partner with the
  **largest ownership for the month** (ties: the partner with the earliest
  `effective_from`, then lowest id).
- Invariant checked on every run:
  `driver pay total + Σ partner shares + carried-forward loss change = vehicle net`
  exactly. If not, the run fails and nothing is written.

## D5 — "Driver" and "Company" expenses

- Only expenses allocated to **Current Vehicle** reduce that vehicle's net.
- **Driver** and **Other / Company** expenses are stored with no vehicle
  (`vehicle_id` NULL plus an `allocation` column) and never reduce any vehicle's
  net automatically.
- They appear in an admin "Unallocated expenses" list. The admin can charge one
  to a vehicle for a month (it then counts as that month's company expense for
  the vehicle) or leave it as a company cost.
- Receipt photo remains mandatory for every allocation.

## D6 — A person who is both driver and partner

- Allowed. The account holds both roles (`app_metadata.roles = ['driver','partner']`)
  and can switch between the two portals.
- Their driver pay and their partner share are calculated **independently** and
  shown as two separate lines. Neither replaces the other.
- The admin screens flag such people so it is always visible and intentional.

## D7 — The unused `calculate-salary` edge function

- Delete it. The engine lives in one Postgres function, called by the admin
  "Run" button and by a monthly scheduled job (`pg_cron`) that creates drafts on
  the 1st for the previous month. Drafts still need admin review and finalize.

## D8 — Commission base when several drivers use one vehicle (new)

Today each driver's commission is taken from the **whole vehicle's** net, so two
drivers on 35% commission on the same car are paid 70% of that car's net.

- Commission and bonus are calculated on the net from **that driver's own**
  rides and expenses on that vehicle (`daily_summary` is already per driver).
- Fixed salary is unaffected.

## Worked examples (engine test cases)

**A. Pure partners (AGENTS.md reference):** partners 35 / 32.5 / 32.5, no driver
pay. Revenue 10,000, expenses 2,000 → net 8,000 → shares **2,800 / 2,600 / 2,600**.

**B. Commission driver:** one driver on 35% commission, partners 50 / 50.
Net 8,000 → driver **2,800** → remaining 5,200 → partners **2,600 / 2,600**.

**C. Mid-month split change (30-day month):** net 3,000 on days 1–10 and
6,000 on days 11–30. No driver pay. Partner X 100% on days 1–10; from day 11
X 60% / Y 40%.
→ X = 3,000 + 3,600 = **6,600**; Y = **2,400**; total 9,000.

**D. Fixed salary, loss month:** salary 4,000, bonus 8%, vehicle net 3,000.
Bonus 240 → driver **4,240**. Partner pool = 3,000 − 4,240 = −1,240 → shares
**0**, loss **1,240** carried to next month.

**E. Rounding:** partners 33.33 / 33.33 / 33.34 %, net 10.00. Raw shares
3.333 / 3.333 / 3.334 round to 3.33 / 3.33 / 3.33 = 9.99. The leftover **0.01**
goes to the largest share → **3.33 / 3.33 / 3.34** = 10.00.

**F. Two commission drivers on one vehicle (D8):** A and B each 30%. A's own net
5,000, B's own net 3,000 → A **1,500**, B **900** (not 30% of 8,000 each).
