-- =============================================================================
-- W5: a driver's change history (driver workspace, History tab)
-- =============================================================================
-- get_driver_history(driver, limit, offset), office only: the audit log
-- (Phase 4) narrowed to one driver: changes to the driver record and to every
-- record that belongs to them (rides, expenses, cash handovers, settlements,
-- pay terms, employment periods, clearance, correction requests, vehicle
-- assignments), newest first, in the same shape as get_audit_log (who, what,
-- old -> new, when). It reads the existing audit log; there is no second one.
-- =============================================================================

-- The driver a logged row belongs to (rows of other tables carry driver_id).
CREATE INDEX IF NOT EXISTS idx_audit_log_driver
  ON public.audit_log (((coalesce(new_values, old_values) ->> 'driver_id')));

CREATE OR REPLACE FUNCTION public.get_driver_history(p_driver_id uuid, p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS TABLE (
  id uuid, changed_at timestamptz, table_name text, record_id uuid, action text,
  actor text, changes jsonb, snapshot jsonb, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM public._require_admin();
  RETURN QUERY
  SELECT
    a.id,
    a.changed_at,
    a.table_name,
    a.record_id,
    coalesce(a.action, 'UPDATE'),
    coalesce(
      d.name || ' (driver)',
      pa.name || ' (partner)',
      u.email,
      CASE WHEN a.changed_by IS NULL THEN 'System' ELSE 'Unknown user' END
    ),
    CASE
      WHEN a.field_changed IS NOT NULL THEN
        jsonb_build_object(a.field_changed, jsonb_build_object('from', a.old_value, 'to', a.new_value))
      WHEN coalesce(a.action, 'UPDATE') = 'UPDATE' THEN (
        SELECT coalesce(jsonb_object_agg(k, jsonb_build_object('from', a.old_values -> k, 'to', a.new_values -> k)), '{}'::jsonb)
        FROM jsonb_object_keys(coalesce(a.new_values, '{}'::jsonb)) k
        WHERE k <> 'updated_at' AND (a.old_values -> k) IS DISTINCT FROM (a.new_values -> k)
      )
    END,
    CASE a.action WHEN 'INSERT' THEN a.new_values WHEN 'DELETE' THEN a.old_values END,
    count(*) OVER ()
  FROM audit_log a
  LEFT JOIN auth.users u ON u.id = a.changed_by
  LEFT JOIN LATERAL (SELECT dr.name FROM drivers dr WHERE dr.linked_auth_id = a.changed_by LIMIT 1) d ON true
  LEFT JOIN LATERAL (SELECT p.name FROM partners p WHERE p.linked_auth_id = a.changed_by LIMIT 1) pa ON true
  WHERE (a.table_name = 'drivers' AND a.record_id = p_driver_id)
     OR (coalesce(a.new_values, a.old_values) ->> 'driver_id') = p_driver_id::text
  ORDER BY a.changed_at DESC, a.id
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_history(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_history(uuid, int, int) TO authenticated;
