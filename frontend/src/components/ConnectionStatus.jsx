import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

/**
 * Responsive network connectivity status badge.
 * Dynamically responds to browser online and offline events.
 */
export function ConnectionStatus() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return (
      <div
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-700/60 shadow-sm transition-colors duration-300"
        title="Network connected — Online"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="tracking-wide">● Online</span>
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/90 text-amber-300 border border-amber-600/70 shadow-sm transition-colors duration-300 animate-pulse"
      title="Network disconnected — Operating in offline cached mode"
    >
      <WifiOff className="h-3.5 w-3.5 text-amber-400" />
      <span className="tracking-wide">● Offline</span>
    </div>
  );
}
