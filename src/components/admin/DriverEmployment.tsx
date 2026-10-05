'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { riyadhToday } from '@/lib/dates';

// Employment record on the admin driver page (docs/driver-profile-plan.md, L1):
// joining date and days with the company; the office can correct the date.
// Leaving and rejoining (L2-L4) add to the same record.

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

export function DriverEmployment({ driverId }: { driverId: string }) {
  const [data, setData] = useState<Employment | null>(null);
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      {earlier.length > 0 && (
        <p className="text-xs text-zinc-400">
          Earlier: {earlier.map(p => `${fmtDate(p.joined_on)} to ${p.left_on ? fmtDate(p.left_on) : p.last_working_day ? fmtDate(p.last_working_day) : '?'}${p.leave_reason ? ` (${p.leave_reason})` : ''}`).join('; ')}
        </p>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
