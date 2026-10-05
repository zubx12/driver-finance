'use client';

import { ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

// One audit-log entry: what changed, by whom, when, old -> new. Used by the
// Audit Log page and by the History tab of a driver's page.

export interface AuditRow {
  id: string;
  changed_at: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  actor: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  snapshot: Record<string, unknown> | null;
  total_count: number;
}

export const AUDIT_TABLES: { value: string; label: string }[] = [
  { value: 'rides', label: 'Rides' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'cash_handovers', label: 'Cash handovers' },
  { value: 'salary_calculations', label: 'Salary runs' },
  { value: 'salary_adjustments', label: 'Adjustments' },
  { value: 'settlements', label: 'Partner payments' },
  { value: 'driver_settlements', label: 'Driver settlements' },
  { value: 'partner_voucher_shares', label: 'Vouchers handed to partners' },
  { value: 'vehicle_partners', label: 'Ownership splits' },
  { value: 'driver_compensation', label: 'Driver pay terms' },
  { value: 'driver_vehicle_assignments', label: 'Vehicle assignments' },
  { value: 'driver_employment_periods', label: 'Employment' },
  { value: 'driver_clearances', label: 'Clearance' },
  { value: 'correction_requests', label: 'Correction requests' },
  { value: 'month_closes', label: 'Month-end close' },
  { value: 'drivers', label: 'Drivers' },
  { value: 'partners', label: 'Partners' },
  { value: 'vehicles', label: 'Vehicles' },
  { value: 'payers', label: 'Payers' },
];

const ACTION_LABEL = { INSERT: 'Created', UPDATE: 'Changed', DELETE: 'Deleted' } as const;
const ACTION_STYLE = {
  INSERT: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  UPDATE: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  DELETE: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
} as const;
// Fields that explain a created/deleted row at a glance.
const SUMMARY_FIELDS = ['amount', 'ride_date', 'expense_date', 'handover_date', 'category', 'payment_method', 'paid_by',
  'status', 'payment_status', 'percentage', 'name', 'period_start', 'joined_on', 'last_working_day', 'reason', 'leave_reason'];

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const label = (field: string) => field.replace(/_/g, ' ');
export const auditTableLabel = (t: string) => AUDIT_TABLES.find(x => x.value === t)?.label ?? t;

export function AuditEntry({ row, onRecordClick }: { row: AuditRow; onRecordClick?: (recordId: string) => void }) {
  const fields = row.action === 'UPDATE'
    ? Object.entries(row.changes ?? {})
    : SUMMARY_FIELDS.filter(f => row.snapshot && f in row.snapshot).map(f => [f, row.snapshot![f]] as const);
  return (
    <Card className="border-zinc-200 dark:border-zinc-800 rounded-xl">
      <CardContent className="p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${ACTION_STYLE[row.action]}`}>{ACTION_LABEL[row.action]}</span>
          <span className="font-semibold">{auditTableLabel(row.table_name)}</span>
          {onRecordClick ? (
            <button className="font-mono text-xs text-indigo-600 hover:underline" title="Show this record's full history"
              onClick={() => onRecordClick(row.record_id)}>
              {row.record_id.slice(0, 8)}
            </button>
          ) : (
            <span className="font-mono text-xs text-zinc-400">{row.record_id.slice(0, 8)}</span>
          )}
          <span className="text-zinc-500">by <span className="text-zinc-800 dark:text-zinc-200">{row.actor}</span></span>
          <span className="ml-auto text-xs text-zinc-400">
            {new Date(row.changed_at).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {fields.length > 0 && (
          <dl className="grid gap-1 text-xs sm:grid-cols-2">
            {fields.map(([field, value]) => (
              <div key={field} className="flex items-center gap-2 min-w-0">
                <dt className="text-zinc-500 shrink-0">{label(field)}:</dt>
                {row.action === 'UPDATE' ? (
                  <dd className="flex items-center gap-1 min-w-0">
                    <span className="text-rose-600 dark:text-rose-400 line-through truncate">{show((value as { from: unknown }).from)}</span>
                    <ArrowRight className="h-3 w-3 text-zinc-400 shrink-0" />
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium truncate">{show((value as { to: unknown }).to)}</span>
                  </dd>
                ) : (
                  <dd className="truncate">{show(value)}</dd>
                )}
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
