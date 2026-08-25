'use client';

/**
 * SalaryToast.tsx
 * Shows a dismissible toast notification when admin finalizes a salary calculation.
 * Rendered by the Partner dashboard.
 */

import { SalaryNotification } from '@/lib/realtime/use-realtime-partner';
import { CheckCircle2, X } from 'lucide-react';

interface Props {
  notifications: SalaryNotification[];
  onDismiss: (id: string) => void;
}

export function SalaryToast({ notifications, onDismiss }: Props) {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full">
      {notifications.map((n) => (
        <div
          key={n.id}
          className="flex items-start gap-3 bg-emerald-600 text-white rounded-xl shadow-lg p-4 animate-in slide-in-from-top-2"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Salary Finalized ✨</p>
            <p className="text-xs text-emerald-100 mt-0.5">
              Period {n.periodStart} → {n.periodEnd}
            </p>
            <p className="text-xs text-emerald-100">
              Net: SAR {n.netRevenue.toLocaleString('en-SA', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <button
            onClick={() => onDismiss(n.id)}
            className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
