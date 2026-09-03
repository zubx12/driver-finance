import React from 'react';

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-3 animate-pulse">
      <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3 bg-zinc-100 dark:bg-zinc-800/50 rounded" style={{ width: `${80 - i * 15}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="text-center py-12 space-y-3">
      <div className="mx-auto w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
        <Icon className="h-6 w-6 text-zinc-400" />
      </div>
      <h3 className="font-semibold text-zinc-700 dark:text-zinc-300">{title}</h3>
      <p className="text-sm text-zinc-500 max-w-xs mx-auto">{description}</p>
    </div>
  );
}
