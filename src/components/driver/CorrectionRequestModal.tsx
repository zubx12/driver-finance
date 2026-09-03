'use client';

/**
 * CorrectionRequestModal.tsx
 *
 * Bottom-sheet modal opened from the History page on any locked past-day entry.
 * Submits a correction_requests INSERT to Supabase so admin can review it.
 */

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useDriver } from '@/contexts/DriverContext';
import { Button } from '@/components/ui/button';
import { Flag, X, CheckCircle2, Loader2 } from 'lucide-react';

interface Props {
  recordType: 'ride' | 'expense';
  recordId: string;
  recordDate: string;
  recordAmount: number;
  onClose: () => void;
}

type Stage = 'form' | 'submitting' | 'success' | 'error';

export function CorrectionRequestModal({
  recordType, recordId, recordDate, recordAmount, onClose,
}: Props) {
  const { driverId } = useDriver();
  const [reason, setReason] = useState('');
  const [stage, setStage] = useState<Stage>('form');

  async function submit() {
    if (!reason.trim() || !driverId) return;
    setStage('submitting');

    const supabase = createClient();
    const { error } = await supabase.from('correction_requests').insert({
      driver_id: driverId,
      record_type: recordType,
      record_id: recordId,
      reason: reason.trim(),
    });

    setStage(error ? 'error' : 'success');
    if (error) console.error('Correction request error:', error);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-t-2xl p-6 space-y-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-amber-500" />
            <h2 className="text-base font-semibold">Request Correction</h2>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Record summary */}
        <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-zinc-500 capitalize">{recordType}</span>
            <span className="font-semibold">{recordAmount.toFixed(2)} SAR</span>
          </div>
          <div className="text-xs text-zinc-400">{recordDate}</div>
        </div>

        {stage === 'form' && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Why does this need correction?</label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Describe the issue clearly (e.g., wrong amount, wrong date)…"
                rows={4}
                className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 bg-white dark:bg-zinc-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <Button
              className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-xl"
              disabled={!reason.trim()}
              onClick={submit}
            >
              Submit Request
            </Button>
          </>
        )}

        {stage === 'submitting' && (
          <div className="flex items-center justify-center py-8 gap-3 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Submitting…
          </div>
        )}

        {stage === 'success' && (
          <div className="flex flex-col items-center py-8 gap-3 text-emerald-600">
            <CheckCircle2 className="h-10 w-10" />
            <p className="font-semibold">Request submitted!</p>
            <p className="text-sm text-zinc-400 text-center">
              Admin will review and resolve it. You'll be notified once resolved.
            </p>
            <Button variant="outline" onClick={onClose} className="mt-2 rounded-xl">Done</Button>
          </div>
        )}

        {stage === 'error' && (
          <div className="text-center py-4 space-y-2">
            <p className="text-rose-600 font-medium">Submission failed</p>
            <p className="text-sm text-zinc-400">Please check your connection and try again.</p>
            <Button variant="outline" onClick={() => setStage('form')} className="rounded-xl">
              Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
