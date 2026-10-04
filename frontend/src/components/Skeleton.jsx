import React from 'react';

/**
 * Skeleton Card / Line loaders
 */
export function SkeletonCard({ lines = 3, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-800/80 bg-slate-900/30 p-5 space-y-4 animate-skeleton ${className}`}>
      <div className="flex items-center justify-between">
        <div className="h-4 w-1/3 rounded-md bg-slate-800"></div>
        <div className="h-4 w-16 rounded-full bg-slate-800"></div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded-md bg-slate-800/60"
            style={{ width: `${85 - i * 15}%` }}
          ></div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-2">
        <div className="h-3 w-20 rounded bg-slate-800/40"></div>
        <div className="h-6 w-20 rounded-lg bg-slate-800/60"></div>
      </div>
    </div>
  );
}

export function SkeletonStat({ className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900/30 p-5 space-y-3 animate-skeleton ${className}`}>
      <div className="flex items-center justify-between">
        <div className="h-3 w-20 rounded bg-slate-800"></div>
        <div className="h-7 w-7 rounded-xl bg-slate-800"></div>
      </div>
      <div className="h-8 w-16 rounded-md bg-slate-800/80"></div>
      <div className="h-2 w-28 rounded bg-slate-800/40"></div>
    </div>
  );
}

export default SkeletonCard;
