import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { syncState, SYNC_STATE } from '../sync/syncState.js';
import conflictRepository from '../db/repositories/conflictRepository.js';
import outboxRepository from '../db/repositories/outboxRepository.js';

/**
 * Responsive network & synchronization status indicator.
 * Displays real-time online/offline state, syncing progress, conflict alerts, and synced state.
 */
export function ConnectionStatus() {
  const [engineState, setEngineState] = useState(syncState.getState());
  const [conflictCount, setConflictCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshCounts = async () => {
    try {
      const activeConflicts = await conflictRepository.getPendingConflicts();
      setConflictCount(activeConflicts.length);

      const pendingMuts = await outboxRepository.getPendingMutations();
      setPendingCount(pendingMuts.length);
    } catch {
      // IndexedDB might not be initialized yet
    }
  };

  useEffect(() => {
    refreshCounts();

    const unsubscribe = syncState.subscribe((next) => {
      setEngineState(next);
      refreshCounts();
    });

    const handleOnline = () => {
      syncState.setOnlineStatus(true);
      refreshCounts();
    };

    const handleOffline = () => {
      syncState.setOnlineStatus(false);
      refreshCounts();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(refreshCounts, 3000);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const isOnline = engineState.isOnline;

  // OFFLINE State
  if (!isOnline) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/90 text-amber-300 border border-amber-600/70 shadow-sm transition-all duration-300 animate-pulse cursor-default"
        title="Network disconnected — All edits saved locally to IndexedDB"
      >
        <WifiOff className="h-3.5 w-3.5 text-amber-400" />
        <span className="tracking-wide">○ Offline</span>
      </div>
    );
  }

  // SYNCING State
  if (engineState.state === SYNC_STATE.SYNCING) {
    return (
      <Link
        to="/sync-center"
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-950/90 text-cyan-300 border border-cyan-500/60 shadow-sm transition-all hover:bg-cyan-900/60"
        title="Synchronizing local changes with backend REST API"
      >
        <RefreshCw className="h-3.5 w-3.5 text-cyan-400 animate-spin" />
        <span className="tracking-wide">⟳ Syncing...</span>
      </Link>
    );
  }

  // CONFLICT State
  if (conflictCount > 0 || engineState.state === SYNC_STATE.CONFLICT) {
    return (
      <Link
        to="/sync-center"
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-950/90 text-amber-300 border border-amber-500/80 shadow-sm transition-all hover:bg-amber-900/80 animate-pulse"
        title={`${conflictCount} conflict(s) requiring attention — Click to resolve`}
      >
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
        <span className="tracking-wide">
          ⚠ {conflictCount > 0 ? `${conflictCount} Conflict${conflictCount > 1 ? 's' : ''}` : 'Conflict'}
        </span>
      </Link>
    );
  }

  // PENDING CHANGES State
  if (pendingCount > 0) {
    return (
      <Link
        to="/sync-center"
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-950/80 text-teal-300 border border-teal-500/60 shadow-sm transition-all hover:bg-teal-900/60"
        title={`${pendingCount} local change(s) waiting to sync`}
      >
        <span className="relative flex h-2 w-2">
          <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-400"></span>
        </span>
        <span className="tracking-wide">⟳ {pendingCount} Pending</span>
      </Link>
    );
  }

  // ONLINE & SYNCHRONIZED State
  return (
    <Link
      to="/sync-center"
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-700/60 shadow-sm transition-all hover:bg-emerald-900/60"
      title="Network connected — All changes synchronized with backend"
    >
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
      <span className="tracking-wide">✓ Synced</span>
    </Link>
  );
}

export default ConnectionStatus;
