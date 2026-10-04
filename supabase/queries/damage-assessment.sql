-- =============================================================================
-- Damage assessment (READ-ONLY)
-- =============================================================================
-- Run each query in the Supabase SQL editor against PRODUCTION before deploying
-- the remediation migrations. Nothing here changes data.
--
-- Queries 1-4 tell you whether the Phase 2 migration will STOP (it refuses to
-- run on data it cannot fix safely). Queries 5-11 measure how much existing
-- payout data is wrong; the results feed the Phase 6 data repair and the note
-- to partners/drivers. Save every result before deploying.
-- =============================================================================


-- ── Blockers for migration 20260930000002 ────────────────────────────────────

-- 1. Ownership rows that end before they start (migration stops).
SELECT id, vehicle_id, partner_id, percentage, effective_from, effective_to
FROM public.vehicle_partners
WHERE effective_to IS NOT NULL AND effective_to < effective_from;

-- 2. Overlapping ownership rows for the same partner and vehicle (migration stops).
SELECT a.vehicle_id, a.partner_id,
       a.id AS row_a, a.effective_from AS a_from, a.effective_to AS a_to,
       b.id AS row_b, b.effective_from AS b_from, b.effective_to AS b_to
FROM public.vehicle_partners a
JOIN public.vehicle_partners b
  ON a.vehicle_id = b.vehicle_id AND a.partner_id = b.partner_id AND a.id < b.id
 AND daterange(a.effective_from, a.effective_to, '[)') && daterange(b.effective_from, b.effective_to, '[)');

-- 3. Overlapping pay terms for the same driver and vehicle (migration stops).
SELECT a.driver_id, a.vehicle_id,
       a.id AS row_a, a.effective_from AS a_from, a.effective_to AS a_to,
       b.id AS row_b, b.effective_from AS b_from, b.effective_to AS b_to
FROM public.driver_compensation a
JOIN public.driver_compensation b
  ON a.driver_id = b.driver_id AND a.vehicle_id = b.vehicle_id AND a.id < b.id
 AND daterange(a.effective_from, a.effective_to, '[)') && daterange(b.effective_from, b.effective_to, '[)');

-- 4. Partner shares PAID more than once (migration stops; owner must review).
SELECT s.share_id, count(*) AS paid_count, sum(s.amount) AS total_paid,
       min(p.name) AS partner, min(sc.period_start) AS period_start
FROM public.settlements s
JOIN public.partners p ON p.id = s.partner_id
JOIN public.salary_calculation_shares scs ON scs.id = s.share_id
JOIN public.salary_calculations sc ON sc.id = scs.calculation_id
WHERE s.status = 'paid'
GROUP BY s.share_id
HAVING count(*) > 1;


-- ── Security ─────────────────────────────────────────────────────────────────

-- 5. Accounts claiming admin in user-editable metadata. Every row must be a
--    real administrator; anything else may be a self-escalated account (C1).
SELECT u.id, u.email, u.created_at, u.last_sign_in_at,
       EXISTS (SELECT 1 FROM public.drivers d WHERE d.linked_auth_id = u.id) AS is_driver,
       EXISTS (SELECT 1 FROM public.partners p WHERE p.linked_auth_id = u.id) AS is_partner
FROM auth.users u
WHERE u.raw_user_meta_data ->> 'role' = 'admin'
ORDER BY u.created_at;


-- ── Payout correctness ───────────────────────────────────────────────────────

-- 6. Calculations that do not add up: net <> driver pay + partner shares.
SELECT sc.id, sc.vehicle_id, sc.period_start, sc.period_end, sc.status,
       sc.net_revenue, sc.driver_pay_total,
       coalesce(sum(scs.share_amount), 0) AS shares_total,
       sc.net_revenue - sc.driver_pay_total - coalesce(sum(scs.share_amount), 0) AS difference
FROM public.salary_calculations sc
LEFT JOIN public.salary_calculation_shares scs ON scs.calculation_id = sc.id
GROUP BY sc.id
HAVING abs(sc.net_revenue - sc.driver_pay_total - coalesce(sum(scs.share_amount), 0)) > 0.05
ORDER BY sc.status DESC, sc.period_start;

-- 7. Duplicate settlements for one share (double finalize). Pending duplicates
--    are voided automatically by the migration; paid ones are query 4.
SELECT share_id, count(*) AS settlements, count(*) FILTER (WHERE status = 'paid') AS paid,
       sum(amount) AS total_amount
FROM public.settlements
GROUP BY share_id
HAVING count(*) > 1;

-- 8. Drivers with pay terms active during a calculated period who received no
--    driver-pay line in that calculation (C4: silently unpaid).
SELECT sc.id AS calculation_id, sc.vehicle_id, sc.period_start, sc.period_end, sc.status,
       dc.driver_id, dc.compensation_type, dc.effective_from, dc.effective_to
FROM public.salary_calculations sc
JOIN public.driver_compensation dc
  ON dc.vehicle_id = sc.vehicle_id
 AND dc.effective_from <= sc.period_end
 AND (dc.effective_to IS NULL OR dc.effective_to > sc.period_start)
WHERE NOT EXISTS (
  SELECT 1 FROM public.driver_pay_calculations dpc
  WHERE dpc.calculation_id = sc.id AND dpc.driver_id = dc.driver_id
)
ORDER BY sc.period_start, sc.vehicle_id;

-- 9. Calculations for the same vehicle whose periods overlap (revenue counted twice).
SELECT a.vehicle_id, a.id AS calc_a, a.period_start AS a_start, a.period_end AS a_end, a.status AS a_status,
       b.id AS calc_b, b.period_start AS b_start, b.period_end AS b_end, b.status AS b_status
FROM public.salary_calculations a
JOIN public.salary_calculations b
  ON a.vehicle_id = b.vehicle_id AND a.id < b.id
 AND daterange(a.period_start, a.period_end, '[]') && daterange(b.period_start, b.period_end, '[]');

-- 10. Vehicles whose currently active ownership splits do not total 100.
SELECT vehicle_id, sum(percentage) AS active_total, count(*) AS partners
FROM public.vehicle_partners
WHERE effective_from <= CURRENT_DATE AND (effective_to IS NULL OR effective_to > CURRENT_DATE)
GROUP BY vehicle_id
HAVING sum(percentage) <> 100;

-- 11. Rides/expenses dated inside a FINALIZED calculation but entered after it
--     was calculated (the payout no longer matches the data).
SELECT 'ride' AS kind, r.id, r.vehicle_id, r.ride_date AS entry_date, r.amount, r.created_at, sc.id AS calculation_id
FROM public.rides r
JOIN public.salary_calculations sc
  ON sc.vehicle_id = r.vehicle_id AND sc.status = 'finalized'
 AND r.ride_date BETWEEN sc.period_start AND sc.period_end
 AND r.created_at > sc.created_at
UNION ALL
SELECT 'expense', e.id, e.vehicle_id, e.expense_date, e.amount, e.created_at, sc.id
FROM public.expenses e
JOIN public.salary_calculations sc
  ON sc.vehicle_id = e.vehicle_id AND sc.status = 'finalized'
 AND e.expense_date BETWEEN sc.period_start AND sc.period_end
 AND e.created_at > sc.created_at
ORDER BY entry_date;


-- ── Data quality ─────────────────────────────────────────────────────────────

-- 12. Daily rollup out of step with the raw entries, by vehicle and month (M1).
WITH raw AS (
  SELECT vehicle_id, date_trunc('month', d)::date AS month, sum(rev) AS revenue, sum(exp) AS expenses
  FROM (
    SELECT vehicle_id, ride_date AS d, amount AS rev, 0 AS exp FROM public.rides
    UNION ALL
    SELECT vehicle_id, expense_date, 0, amount FROM public.expenses WHERE vehicle_id IS NOT NULL
  ) x
  GROUP BY 1, 2
),
rollup AS (
  SELECT vehicle_id, date_trunc('month', summary_date)::date AS month,
         sum(total_revenue) AS revenue, sum(total_expenses) AS expenses
  FROM public.daily_summary
  GROUP BY 1, 2
)
SELECT coalesce(raw.vehicle_id, rollup.vehicle_id) AS vehicle_id,
       coalesce(raw.month, rollup.month) AS month,
       raw.revenue AS raw_revenue, rollup.revenue AS rollup_revenue,
       raw.expenses AS raw_expenses, rollup.expenses AS rollup_expenses
FROM raw
FULL JOIN rollup ON raw.vehicle_id = rollup.vehicle_id AND raw.month = rollup.month
WHERE coalesce(raw.revenue, 0) <> coalesce(rollup.revenue, 0)
   OR coalesce(raw.expenses, 0) <> coalesce(rollup.expenses, 0)
ORDER BY month, vehicle_id;

-- 13. Voucher rides with no paying organisation recorded (H5: payer dropped by sync).
SELECT count(*) AS voucher_rides_without_payer, sum(amount) AS amount
FROM public.rides
WHERE payment_method = 'Voucher' AND payer_id IS NULL;
