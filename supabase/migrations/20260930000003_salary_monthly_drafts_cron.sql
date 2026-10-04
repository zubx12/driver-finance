-- =============================================================================
-- Phase 2 remediation: monthly draft payouts (replaces the calculate-salary
-- edge function, decision D7)
-- =============================================================================
-- On the 1st of each month at 04:00 Riyadh time (01:00 UTC), draft the previous
-- month for every vehicle. Drafts still need admin review and finalize.
--
-- If pg_cron is not enabled on this project the job is skipped with a notice;
-- enable it under Database > Extensions and re-run this block.
-- =============================================================================
DO $outer$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.schedule(
      'monthly-salary-drafts',
      '0 1 1 * *',
      $job$SELECT public._run_salary_month(((now() AT TIME ZONE 'Asia/Riyadh')::date - interval '1 month')::date)$job$
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Monthly salary draft job not scheduled (pg_cron unavailable): %', SQLERRM;
  END;
END
$outer$;
