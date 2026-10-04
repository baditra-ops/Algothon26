import React from 'react';

/**
 * Placeholder connectivity indicator for Prompt 1 foundation.
 * Note: Dynamic browser online/offline event listeners will be integrated in Prompt 2.
 */
export function StatusBadge() {
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 shadow-sm"
      title="Placeholder status: Browser online/offline detection will be implemented in a later prompt."
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      <span>● Online</span>
    </div>
  );
}
