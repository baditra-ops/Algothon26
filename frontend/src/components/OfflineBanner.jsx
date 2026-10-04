import React from 'react';
import { WifiOff, ShieldAlert } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

/**
 * Subtle notification bar shown only when the device is disconnected from the network.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div className="bg-amber-950/90 border-b border-amber-800/80 px-4 py-2 text-xs text-amber-200">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <WifiOff className="h-4 w-4 text-amber-400 shrink-0" />
          <span>
            <strong>Offline Mode Active:</strong> Running from cached application shell. Server communication is temporarily paused.
          </span>
        </div>
        <span className="hidden sm:inline text-[11px] font-medium text-amber-400/90 bg-amber-900/40 px-2.5 py-0.5 rounded-full border border-amber-700/50">
          Local Persistence Active
        </span>
      </div>
    </div>
  );
}
