'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, LogOut, Pencil, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { riyadhToday } from '@/lib/dates';

// Employment record on the admin driver page (docs/driver-profile-plan.md §5):
// joining date and days with the company (L1); "Start leaving" with the last
// working day and reason, or keeping the driver after all (L2). Clearance and
// rejoining (L3-L4) add to the same record.

const LEAVE_REASONS = ['Resigned', 'Contract ended', 'Dismissed', 'Moved to another job', 'Left the country', 'Other'];

interface Period {
  id: string;
  joined_on: string;
  last_working_day: string | null;
  left_on: string | null;
  leave_reason: string | null;
}
interface Employment { current: Period | null; days_employed: number | null; periods: Period[]; }

const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function tenure(days: number): string {
  if (days < 60) return `${days} day${days === 1 ? '' : 's'}`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} months`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} year${years === 1 ? '' : 's'}${rest ? ` ${rest} months` : ''}`;
}

export function DriverEmployment({ driverId, status, onChanged }: {
  driverId: string;
  status: string;
  /** Called after leaving starts or is cancelled (vehicle, status and pay terms change). */
  onChanged: () => void;
}) {
  const [data, setData] = useState<Employment | null>(null);
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [lastDay, setLastDay] = useState(riyadhToday());
  const [reason, setReason] = useState(LEAVE_REASONS[0]);
  const [reasonText, setReasonText] = useState('');

  const fetchEmployment = useCallback(async () => {
    const { data: d, error: err } = await createClient().rpc('get_driver_employment', { p_driver_id: driverId });
    if (err) throw new Error(err.message);
    return d as Employment;
  }, [driverId]);

  useEffect(() => {
    let current = true;
    fetchEmployment()
      .then(d => { if (current) setData(d); })
      .catch(e => { if (current) setError((e as Error).message); });
    return () => { current = false; };
  }, [fetchEmployment]);

  const save = async () => {
    setBusy(true); setError(null);
    const { error: err } = await createClient().rpc('set_driver_joined_on', { p_driver_id: driverId, p_joined_on: date });
    if (err) { setError(err.message); setBusy(false); return; }
    try { setData(await fetchEmployment()); } catch (e) { setError((e as Error).message); }
    setEditing(false); setBusy(false);
  };

  const startLeaving = async () => {
    const fullReason = reason === 'Other' ? reasonText.trim() : [reason, reasonText.trim()].filter(Boolean).join(': ');
    if (!fullReason) { setError('Give the reason for leaving.'); return; }
    setBusy(true); setError(null);
    const { error: err } = await createClient().rpc('start_driver_leaving', {
      p_driver_id: driverId, p_last_working_day: lastDay, p_reason: fullReason,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    onChanged();
  };

  const keepDriver = async () => {
    setBusy(true); setError(null);
    const { error: err } = await createClient().rpc('cancel_driver_leaving', { p_driver_id: driverId });
    setBusy(false);
    if (err) { setError(err.message); return; }
    onChanged();
  };

  const cur = data?.current;
  const earlier = data?.periods.filter(p => p.id !== cur?.id) ?? [];

  return (
    <div className="text-sm text-zinc-500 space-y-1">
      {cur && !editing && (
        <p className="flex items-center gap-2 flex-wrap">
          <CalendarDays className="h-4 w-4 shrink-0" />
          <span>
            Joined <b className="text-zinc-700 dark:text-zinc-300">{fmtDate(cur.joined_on)}</b>
            {data?.days_employed != null && ` · ${tenure(data.days_employed)} with the company`}
            {cur.last_working_day && ` · last working day ${fmtDate(cur.last_working_day)}`}
            {cur.left_on && ` · left ${fmtDate(cur.left_on)}`}
          </span>
          {!cur.last_working_day && (
            <button onClick={() => { setDate(cur.joined_on); setEditing(true); setError(null); }}
              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline" aria-label="Correct the joining date">
              <Pencil className="h-3 w-3" />Edit
            </button>
          )}
        </p>
      )}
      {editing && (
        <div className="flex items-center gap-2 flex-wrap">
          <span>Joining date</span>
          <Input type="date" max={riyadhToday()} value={date} onChange={e => setDate(e.target.value)} className="h-8 w-40" />
          <Button size="sm" disabled={busy || !date} onClick={save} className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white">
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setEditing(false); setError(null); }} className="h-8 text-xs">Cancel</Button>
        </div>
      )}
      {status === 'Leaving' && cur?.last_working_day && (
        <div className="mt-2 p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 space-y-2">
          <p>
            <b>Leaving</b> · last working day {fmtDate(cur.last_working_day)} · {cur.leave_reason}.
            The vehicle and pay terms ended that day. The driver can still log in to upload entries and hand over cash.
            Clear all payments, then approve clearance to close the account.
          </p>
          <Button size="sm" variant="outline" disabled={busy} onClick={keepDriver} className="h-8 text-xs gap-1">
            <Undo2 className="h-3.5 w-3.5" />Keep driver (cancel leaving)
          </Button>
          <p className="text-xs">If you keep the driver, assign the vehicle and pay terms again.</p>
        </div>
      )}
      {(status === 'Active' || status === 'Inactive' || status === 'Suspended') && cur && !leaving && !editing && (
        <button onClick={() => { setLeaving(true); setError(null); }}
          className="inline-flex items-center gap-1 text-xs text-rose-600 hover:underline">
          <LogOut className="h-3 w-3" />Start leaving…
        </button>
      )}
      {leaving && (
        <div className="mt-2 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2 max-w-xl">
          <p className="font-semibold text-zinc-700 dark:text-zinc-300">Start leaving</p>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-xs space-y-1">
              <span>Last working day</span>
              <Input type="date" min={cur?.joined_on} max={riyadhToday()} value={lastDay} onChange={e => setLastDay(e.target.value)} className="h-8 w-40" />
            </label>
            <label className="text-xs space-y-1">
              <span>Reason</span>
              <select value={reason} onChange={e => setReason(e.target.value)}
                className="h-8 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 text-sm text-zinc-900 dark:text-zinc-100">
                {LEAVE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <Input placeholder={reason === 'Other' ? 'Reason (required)' : 'Details (optional)'} value={reasonText}
              onChange={e => setReasonText(e.target.value)} className="h-8 flex-1 min-w-40" />
          </div>
          <p className="text-xs">
            The vehicle and pay terms end on the last working day. Nothing is deleted. The driver can still upload
            entries up to that day and hand over cash until the office approves clearance.
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !lastDay} onClick={startLeaving} className="h-8 text-xs bg-rose-600 hover:bg-rose-700 text-white">
              {busy ? 'Saving…' : 'Start leaving'}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setLeaving(false)} className="h-8 text-xs">Cancel</Button>
          </div>
        </div>
      )}
      {earlier.length > 0 && (
        <p className="text-xs text-zinc-400">
          Earlier: {earlier.map(p => `${fmtDate(p.joined_on)} to ${p.left_on ? fmtDate(p.left_on) : p.last_working_day ? fmtDate(p.last_working_day) : '?'}${p.leave_reason ? ` (${p.leave_reason})` : ''}`).join('; ')}
        </p>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
