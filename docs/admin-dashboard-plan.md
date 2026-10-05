# Admin dashboard: plan to make it professional

Owner request (2026-10-05): make the admin Overview more professional.
Reviewed: `src/app/admin/page.tsx`, `AdminLiveBanner.tsx`, `revenue-chart.tsx`,
`src/app/admin/layout.tsx`, and the live page.

A professional dashboard answers three questions in this order, in under ten
seconds: **What needs my action? How is the business doing? Where exactly?**
Today the page only half-answers the second one, and some of its numbers or
labels are wrong.

## 1. What is wrong today

### Bugs (wrong or misleading)
| # | Problem | Where |
|---|---|---|
| B1 | Choosing **This Week** or **Last Month** still labels every card "Month to date", and the subtitle always says "Month-to-date". | `page.tsx` cards, header |
| B2 | **"Net Profit" is not profit.** It is revenue minus vehicle expenses, before driver pay, office expenses and corrections. Shown as profit, it overstates what partners receive. | `page.tsx` (netRevenue) |
| B3 | The **Refresh** button on "New driver data synced" does nothing: it calls `router.refresh()`, but the page loads its data in the browser, which a refresh does not reload. | `AdminLiveBanner.tsx` |
| B4 | When loading fails, the error is hidden and the page shows **0.00 SAR** as if it were real. | `page.tsx` catch |
| B5 | Switching period shows the **old numbers** with no loading sign until the new ones arrive. | `page.tsx` |
| B6 | The chart is **always the last 7 days**, whatever period is chosen. Its axis rounds small amounts to "0k / 1k". | `page.tsx`, `revenue-chart.tsx` |
| B7 | "Recent Driver Activity" shows rides only, as "Synced 500.00 SAR", with no vehicle, no cash/voucher, and entries 31-40 days old under "Recent". Expenses and handovers never appear. | `AdminLiveBanner.tsx` |
| B8 | "Active Drivers" counts registered drivers, not drivers who **worked** in the period. | `page.tsx` |

### Missing (what an owner/office manager needs every day)
- **Things waiting for the office**: handovers to confirm, expenses to review,
  correction requests, payouts in draft, drivers not settled, partners not paid.
  These live on 6 different screens; the dashboard shows none of them.
- **Cash still with drivers** and **vouchers not yet collected**, the two
  numbers that decide the office's cash.
- **Comparison** with the previous period (up/down).
- **Per-vehicle view**: which car earns, which is idle, whose payout is open.
- **Month-end status** for last month (7G).

### Look and feel
- 16 menu items in one flat list; the list runs off the screen (Outstanding is cut off).
- Pastel cards with similar weight: nothing stands out; no hierarchy.
- Money written two ways across the app ("0.00 SAR" here, "SAR 0.00" elsewhere).
- No date context (today in Riyadh), no signed-in user shown, plain "Loading…" text.

## 2. Target layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Overview                         Sun 5 Oct 2026 · Riyadh   [This Month ▾] │
├──────────────────────────────────────────────────────────────────────────┤
│ NEEDS YOUR ACTION                                                          │
│ [2 handovers to confirm] [1 expense to review] [September: 2 of 4 steps ▸] │
├──────────────────────────────────────────────────────────────────────────┤
│ Revenue        Est. balance to share   Cash with drivers   Vouchers out   │
│ SAR 48,200     SAR 21,350              SAR 6,400           SAR 3,100      │
│ ▲ 12% vs Sep   after driver pay        3 drivers           9 vouchers     │
│ cash 41k · vch 7k                                                         │
├──────────────────────────────────────────────────────────────────────────┤
│ Revenue vs expenses (the chosen period)  │ Activity (rides, expenses,      │
│ ▇▇ ▇▇ ▇▇ ▇▇ ▇▇ ── net                     │ handovers, with vehicle & type) │
├──────────────────────────────────────────────────────────────────────────┤
│ FLEET  Plate · Driver now · Revenue · Expenses · Net · Days worked ·      │
│        Last ride · Last month's payout     (idle cars flagged)            │
└──────────────────────────────────────────────────────────────────────────┘
```

## 3. Build plan

Each step: database function and tests where needed, then screen, then build,
then a check on the live page (desktop, phone, dark mode), then commit.

| Step | What | Size |
|---|---|---|
| **D1 Fix what is wrong** | B1-B8: labels follow the period; loading per period and a clear error with "Try again"; Refresh really reloads; rename "Net Profit"; chart follows the period with readable amounts; activity shows type, vehicle and date; "Drivers who worked". | ½ day |
| **D2 Needs your action** | One database call `get_admin_dashboard(start, end)` (one round trip, tested against the payout engine and settlements). Action strip at the top: each item a count + link, hidden when zero; last month's close progress (7G). | 1 day |
| **D3 Headline numbers** | Revenue (cash / vouchers split), **estimated balance to share after driver pay** (the reporting estimate already computes this), cash still with drivers (open settlements), vouchers outstanding; each with ▲▼ against the previous equal period. | 1 day |
| **D4 Fleet table** | One row per vehicle: driver now, revenue, expenses, net, days worked, last ride, last month's payout status; sort by any column; click to open the monthly report; cars with no ride for 3+ days flagged. | ½-1 day |
| **D5 Chart and activity** | Daily bars (revenue, expenses) with a net line for the chosen period; clear tooltip; colours that work in dark mode. Activity: rides, expenses and handovers with type, vehicle and "for date"; "View all" to Daily Reports. | ½ day |
| **D6 Layout and navigation** | Menu in groups (**Today**: Overview, Daily Reports, Cash Handovers, Expense Review, Corrections, Outstanding · **Month end**: Salary Runs, Driver Settlements, Partner Settlements, Month-End Close, Monthly Reports · **Setup**: Drivers, Partners, Vehicles · **Records**: Audit Log), with count badges on items that need action; top bar with Riyadh date and signed-in user; skeleton loading; one money format ("SAR 1,234.00") app-wide; helpful empty states; keyboard and screen-reader basics. | 1 day |

Order: D1 first (correctness), then D2 + D3 (they share the database call),
then D4, D5, D6. About 4-5 working days in total, delivered step by step.

## 4. Decisions for the owner
1. **Headline figure**: recommended "Estimated balance to share", after driver
   pay, clearly marked as an estimate until the month is finalized.
2. **Default period**: recommended **This Month**.
3. **Language**: English now; an Arabic/Urdu switch would be a separate step later.

## 5. Done means
- Every number on the dashboard equals the same number on its detail screen
  (tested in the database, like the reports).
- Nothing on it is mislabelled; errors are shown, never zeros.
- Works on a phone, in dark mode, and loads in one call.
