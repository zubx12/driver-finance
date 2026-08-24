# Rule: Financial Data Integrity

Applies to: `rides`, `expenses`, `vehicle_partners`, `salary_calculations`, `salary_calculation_shares`, `audit_log`.

- All monetary columns are `numeric(10,2)`. Never `float` or `double precision` for money.
- Every `UPDATE` on `rides` or `expenses` must be captured by a database trigger writing to `audit_log` — this cannot depend on application code remembering to log it.
- Drivers can only `UPDATE` a `rides`/`expenses` row where the entry's date equals the current date. This is enforced in the RLS policy, not only in the UI.
- `vehicle_partners.percentage` values for a given vehicle's active (overlapping `effective_from`/`effective_to`) rows must sum to exactly 100 — reject the write otherwise.
- Once a `salary_calculations` row has `status = 'finalized'`, it is immutable. Corrections require a new calculation, never an edit to the finalized one.
- `salary_calculation_shares.percentage_applied` is a snapshot at calculation time — never recompute it retroactively from the current `vehicle_partners` percentage if that percentage has since changed.
- `expenses.receipt_image_url` is `NOT NULL` at the database level — an expense cannot exist without a receipt image, regardless of what client submitted it.
