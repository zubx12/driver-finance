'use client';

/**
 * Admin Correction Requests Queue (/admin/corrections)
 *
 * Shows all pending driver correction requests.
 * Subscribes to Supabase Realtime so new requests appear live.
 * Admin can approve or reject each request with an optional note.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Clock, Radio } from 'lucide-react';

interface CorrectionRequest {
  id: string;
  driver_id: string;
  record_type: 'ride' | 'expense';
  record_id: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  created_at: string;
  driverName: string;
}

export default function AdminCorrectionsPage() {
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [actionNote, setActionNote] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  const fetchRequests = useCallback(async () => {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('correction_requests')
      .select('*, drivers(name)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (data) {
      setRequests(data.map((r: any) => ({ ...r, driverName: r.drivers?.name ?? 'Unknown' })));
    }
    setIsLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchRequests();

    const supabase = getSupabase();
    const channel = supabase
      .channel('admin-corrections-queue')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'correction_requests' },
        () => fetchRequests())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'correction_requests' },
        () => fetchRequests())
      .subscribe(s => setIsConnected(s === 'SUBSCRIBED'));

    return () => { supabase.removeChannel(channel); };
  }, [fetchRequests]); // eslint-disable-line react-hooks/exhaustive-deps

  async function resolve(id: string, status: 'approved' | 'rejected') {
    await getSupabase()
      .from('correction_requests')
      .update({ status, admin_note: actionNote[id] ?? null, resolved_at: new Date().toISOString() })
      .eq('id', id);
    // Realtime UPDATE event triggers fetchRequests automatically
  }

  const pending  = requests.filter(r => r.status === 'pending');
  const resolved = requests.filter(r => r.status !== 'pending');

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-SA', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Correction Requests</h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Review and action driver-flagged entries.
          </p>
        </div>
        {isConnected && (
          <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 rounded-full">
            <Radio className="h-3 w-3 animate-pulse" /> LIVE
          </span>
        )}
      </header>

      {/* ── Pending ─────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Pending ({pending.length})</h2>
        {isLoading && <p className="text-zinc-400 text-sm">Loading…</p>}
        {!isLoading && pending.length === 0 && (
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardContent className="py-12 text-center text-zinc-400">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
              No pending correction requests.
            </CardContent>
          </Card>
        )}
        {pending.map(req => (
          <Card key={req.id} className="border-amber-200 dark:border-amber-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  {req.driverName}
                  <span className="text-xs font-normal text-zinc-500 capitalize">
                    • {req.record_type}
                  </span>
                </CardTitle>
                <span className="text-xs text-zinc-400">{fmt(req.created_at)}</span>
              </div>
              <CardDescription className="pt-1">{req.reason}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs font-mono text-zinc-400">
                Record ID: {req.record_id}
              </div>
              <textarea
                value={actionNote[req.id] ?? ''}
                onChange={e => setActionNote(prev => ({ ...prev, [req.id]: e.target.value }))}
                placeholder="Admin note (optional)…"
                rows={2}
                className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => resolve(req.id, 'approved')}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-rose-300 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  onClick={() => resolve(req.id, 'rejected')}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* ── Resolved ────────────────────────────────────────────────────────── */}
      {resolved.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-500">Resolved ({resolved.length})</h2>
          {resolved.map(req => (
            <Card key={req.id} className="border-zinc-200 dark:border-zinc-800 opacity-70">
              <CardContent className="p-4 flex items-start gap-3">
                {req.status === 'approved'
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  : <XCircle className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {req.driverName}{' '}
                    <span className="text-zinc-400 capitalize">({req.record_type})</span>
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">{req.reason}</p>
                  {req.admin_note && (
                    <p className="text-xs text-zinc-400 mt-0.5">Note: {req.admin_note}</p>
                  )}
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  req.status === 'approved'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400'
                }`}>
                  {req.status}
                </span>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
