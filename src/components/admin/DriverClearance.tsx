'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, CircleAlert, CircleHelp, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';

// Clearance before a leaving driver is closed (docs/driver-profile-plan.md §5,
// L3). Every line must be clear; the office confirms the phone's entries were
// uploaded and approves. Then the driver is Left; every record is kept.

interface Line { key: string; label: string; ok: boolean | null; detail: string; }
interface Clearance {
  status: string;
  lines: Line[];
  ready: boolean;
  final_settlement_month: string | null;
  total_written_off: number;
  vouchers_outstanding: { count: number; amount: number };
  clearance: { approved_at: string; note: string | null; total_written_off: number } | null;
}

const LINKS: Record<string, { href: string; label: string }> = {
  handovers: { href: '/admin/handovers', label: 'Cash Handovers' },
  corrections: { href: '/admin/corrections', label: 'Corrections' },
  payouts: { href: '/admin/salary', label: 'Salary Runs' },
  settlements: { href: '/admin/driver-settlements', label: 'Driver Settlements' },
  final_balance: { href: '/admin/driver-settlements', label: 'Driver Settlements' },
};

export function DriverClearance({ driverId, onChanged }: { driverId: string; onChanged: () => void }) {
  const [data, setData] = useState<Clearance | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClearance = useCallback(async () => {
    const { data: d, error: err } = await createClient().rpc('get_driver_clearance', { p_driver_id: driverId });
    if (err) throw new Error(err.message);
    return d as Clearance;
  }, [driverId]);

  useEffect(() => {
    let current = true;
    fetchClearance()
      .then(d => { if (current) setData(d); })
      .catch(e => { if (current) setError((e as Error).message); });
    return () => { current = false; };
  }, [fetchClearance]);

  const approve = async () => {
    setBusy(true); setError(null);
    const { error: err } = await createClient().rpc('approve_driver_clearance', {
      p_driver_id: driverId, p_entries_uploaded: confirmed, p_note: note || null,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    onChanged();
  };

  if (!data) {
    return error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null;
  }

  return (
    <Card className={data.status === 'Left' ? 'border-zinc-200 dark:border-zinc-800' : 'border-amber-200 dark:border-amber-800'}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          {data.status === 'Left' ? 'Clearance approved' : 'Clearance before closing the driver'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {data.clearance && (
          <p className="text-zinc-600 dark:text-zinc-400">
            Approved {new Date(data.clearance.approved_at).toLocaleDateString('en-GB', { timeZone: 'Asia/Riyadh' })}
            {Number(data.clearance.total_written_off) > 0 && ` · SAR ${Number(data.clearance.total_written_off).toFixed(2)} written off`}
            {data.clearance.note && ` · ${data.clearance.note}`}. Every record is kept.
          </p>
        )}

        <ul className="space-y-1.5">
          {data.lines.map(l => (
            <li key={l.key} className="flex gap-2">
              {l.ok === true ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                : l.ok === false ? <CircleAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                : <CircleHelp className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />}
              <span>
                <span className="font-medium">{l.label}</span>
                <span className="text-zinc-500"> · {l.detail}</span>
                {l.ok === false && LINKS[l.key] && (
                  <Link href={LINKS[l.key].href} className="text-indigo-600 ml-2 text-xs">{LINKS[l.key].label} →</Link>
                )}
              </span>
            </li>
          ))}
        </ul>

        {data.vouchers_outstanding.count > 0 && (
          <p className="text-xs text-zinc-500">
            For information: {data.vouchers_outstanding.count} voucher(s) from this driver&apos;s rides are still outstanding
            (SAR {Number(data.vouchers_outstanding.amount).toFixed(2)}). They belong to the vehicle&apos;s partners and do not block clearance.
          </p>
        )}

        {data.status === 'Leaving' && (
          <div className="space-y-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" />
              <span>I confirmed with the driver that every entry on their phone has been uploaded.</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} className="h-9 flex-1 min-w-48" />
              <Button disabled={busy || !data.ready || !confirmed} onClick={approve}
                className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                <ShieldCheck className="h-4 w-4" />{busy ? 'Approving…' : 'Approve clearance'}
              </Button>
            </div>
            {!data.ready && <p className="text-xs text-zinc-500">Clear every red line first. The driver can still log in until clearance is approved.</p>}
            <p className="text-xs text-zinc-500">Approving closes the driver&apos;s login. Nothing is deleted, and the driver can rejoin later.</p>
          </div>
        )}
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
