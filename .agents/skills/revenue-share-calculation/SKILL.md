---
name: revenue-share-calculation
description: Use when building or editing the salary/payout calculation logic that splits a vehicle's net revenue among its partners by percentage.
---

# Skill: Vehicle Revenue-Share Calculation

## When to use this
Any work on `salary_calculations`, `salary_calculation_shares`, the admin "Run Calculation" flow, or the monthly auto-draft Edge Function.

## Calculation logic

```
total_revenue  = SUM(rides.revenue_amount)   WHERE vehicle_id = X AND ride_date BETWEEN period_start AND period_end
total_expenses = SUM(expenses.amount)        WHERE vehicle_id = X AND expense_date BETWEEN period_start AND period_end
net_amount     = total_revenue - total_expenses

FOR EACH active vehicle_partners row on vehicle X during the period:
    share_amount = net_amount * (percentage / 100)
```

## Worked example (use this as the test case)
Vehicle with three partners: 35%, 32.5%, 32.5%. Period revenue = 10,000. Period expenses = 2,000.
- `net_amount` = 8,000
- Partner 1 share = 8,000 × 0.35 = **2,800**
- Partner 2 share = 8,000 × 0.325 = **2,600**
- Partner 3 share = 8,000 × 0.325 = **2,600**
- Sum of shares must equal `net_amount` exactly (2,800 + 2,600 + 2,600 = 8,000) — if it doesn't, the percentage validation on `vehicle_partners` has a bug.

## Required rules
- Use the `vehicle_partners` row(s) that were **effective during the period being calculated** (`effective_from`/`effective_to`), not necessarily the current live split — a mid-period renegotiation should not be applied retroactively to an earlier period.
- Always create calculations as `status = 'draft'` first. Only an explicit admin action sets `status = 'finalized'`.
- Once `finalized`, a calculation and its shares are immutable — never update in place. If revenue/expense entries are edited after finalization, that does not retroactively change a finalized calculation; it would require a new calculation for a new period or an explicit admin-reviewed correction.
- `percentage_applied` on each `salary_calculation_shares` row is a snapshot — store the actual percentage used, not a foreign key alone, so the number is correct even if `vehicle_partners.percentage` changes later.

## Common mistake to avoid
Recomputing a partner's share live from the *current* `vehicle_partners.percentage` when displaying a historical finalized calculation. Always read `percentage_applied` from the stored share row, never the live vehicle_partners table, for anything already finalized.
