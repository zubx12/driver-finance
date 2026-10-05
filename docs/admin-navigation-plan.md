# Admin navigation: from 15 menu items to 8

Owner request (2026-10-05): "the sidebar looks very messy; merge it and do
not create unrelated pages."

## 1. Today (15 items, one flat list)

Overview · Daily Reports · Drivers · Partners · Vehicles · Expense Review ·
Cash Handovers · Salary Runs · Driver Settlements · Partner Settlements ·
Monthly Reports · Month-End Close · Outstanding · Corrections · Audit Log

Problems: related work is split over separate pages (two settlement pages,
three review queues, close / payouts / reports for the same month); the list
does not fit on a laptop screen; nothing shows what needs attention.

## 2. Target (in groups, with counts)

Built 2026-10-05 (branch feat/admin-navigation), final structure:
```
Overview · Inbox (count)   Inbox tabs: Cash handovers · Expense review · Corrections
MANAGE    Drivers · Vehicles · Partners
FINANCE   Month End        tabs: Checklist · Payouts · Driver settlements · Partner settlements
          Vouchers (count) tabs: Outstanding · Handed to partners
REPORTS   Reports          tabs: Monthly reports · Daily entries
SYSTEM    Audit Log
```
Each screen inside Month End still has its own month picker (one shared picker
is a later polish step). The first draft of the target follows.

```
Overview
Inbox                 (5)   ← tabs: Cash handovers · Expenses · Corrections
─ MANAGE ─
Drivers                     ← each driver = full profile (driver-profile-plan.md)
Vehicles                    ← each vehicle = profile + monthly report
Partners
─ MONEY ─
Vouchers              (9)   ← tabs: Outstanding · Handed to partners
Month End                   ← one month at a time, tabs in the order of work:
                              Checklist · Payouts · Driver settlements ·
                              Partner settlements · Reports
─ RECORDS ─
Records                     ← tabs: Daily entries · Audit log
```

| Today | Goes to |
|---|---|
| Cash Handovers, Expense Review, Corrections | **Inbox** (one queue of everything waiting for the office, a tab each, count on each tab and on the menu item) |
| Outstanding, Partner Settlements → Vouchers tab | **Vouchers** |
| Month-End Close, Salary Runs, Driver Settlements, Partner Settlements, Monthly Reports | **Month End** (one month selector at the top, shared by all tabs) |
| Daily Reports, Audit Log | **Records** |
| Drivers, Vehicles, Partners | stay, grouped under Manage |

Rules from now on:
- **No new menu items.** A new feature becomes a tab or a section of one of these 8.
- Each tab has its own address (e.g. `/admin/month-end?tab=payouts&month=2026-09`),
  so links, the browser's Back button and bookmarks work.
- The old addresses (`/admin/salary`, `/admin/handovers`, …) redirect to the new
  tab, so nothing breaks.
- The existing screens are moved inside the tabs as they are (their logic is not
  rewritten in this step).
- Menu counts come from one database call (the same one as the dashboard's
  "Needs your action", plan D2), not one query per item.

## 3. Build steps
| Step | What | Size |
|---|---|---|
| N1 | Grouped sidebar (Manage / Money / Records), mobile menu the same, active item for sub-pages | ½ day |
| N2 | Tabbed hubs: Inbox, Vouchers, Month End, Records; existing screens moved in; redirects from old addresses | 1 day |
| N3 | Counts on menu items and tabs (one database call, tested) | ½ day |
