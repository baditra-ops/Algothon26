import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Clock,
  Sparkles,
  Trash2,
  ListOrdered,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  WifiOff
} from 'lucide-react';
import {
  getLocalDatabaseStats,
  getPendingSyncRecords,
  getOutboxMutations,
  getConflicts,
  clearCompletedMutations,
  clearLocalDatabase,
  seedDevelopmentData
} from '../db/devTools';
import { syncManager, syncState, SYNC_STATE, calculateFieldDiffs } from '../sync/index.js';
import { SYNC_STATUS } from '../db/schema.js';
import ConflictResolutionModal from '../components/ConflictResolutionModal.jsx';
import { MagneticButton } from '../components/MagneticButton';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { Tooltip } from '../components/Tooltip';
import { useToast } from '../context/ToastContext';

export function SyncCenterPage() {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState(null);
  const [mutations, setMutations] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [engineState, setEngineState] = useState(syncState.getState());
  const [selectedConflict, setSelectedConflict] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showResolvedHistory, setShowResolvedHistory] = useState(false);

  const loadTelemetry = async () => {
    setLoading(true);
    try {
      const s = await getLocalDatabaseStats();
      const p = await getPendingSyncRecords();
      const m = await getOutboxMutations();
      const c = await getConflicts();
      setStats(s);
      setPending(p);
      setMutations(m);
      setConflicts(c);
    } catch (err) {
      console.error('[SyncCenter] Error loading telemetry:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTelemetry();

    // Subscribe to sync state changes
    const unsubscribe = syncState.subscribe((next) => {
      setEngineState(next);
      loadTelemetry();
    });

    return () => unsubscribe();
  }, []);

  const handleManualSync = async () => {
    try {
      const res = await syncManager.triggerManualSync();
      if (res?.skipped) {
        toast.warning('Sync Skipped', `Engine reason: ${res.reason}`);
      } else if (res?.failed) {
        toast.error('Sync Failed', res.error || 'Check backend connection');
      } else if (res?.conflicts > 0) {
        toast.warning('Conflict Captured', `${res.conflicts} concurrency conflict(s) stored for review`);
      } else {
        toast.success(
          'Synchronization Complete',
          `${res.succeeded || 0} mutation(s) pushed · Local store matches cloud`
        );
      }
    } catch (err) {
      toast.error('Sync Error', err.message);
    }
    await loadTelemetry();
  };

  const handleRetryMutation = async (id) => {
    await syncManager.retryMutation(id);
    toast.info('Mutation Queued', 'Reset mutation to PENDING and triggered background sync');
    await loadTelemetry();
  };

  const handleSeed = async () => {
    await seedDevelopmentData();
    toast.success('Demo Data Seeded', 'Sample projects, tasks, and outbox mutations added');
    await loadTelemetry();
  };

  const handleClearCompleted = async () => {
    const count = await clearCompletedMutations();
    toast.info('Outbox Pruned', `Purged ${count} completed mutation(s) from local storage`);
    await loadTelemetry();
  };

  const handleClear = async () => {
    if (!window.confirm('Clear all local IndexedDB records (projects, tasks, outbox, and conflicts)?')) return;
    await clearLocalDatabase();
    toast.warning('Database Cleared', 'IndexedDB tables completely wiped');
    await loadTelemetry();
  };
  const isSyncing = engineState.state === SYNC_STATE.SYNCING;

  const handleRetryAllFailed = async () => {
    const failedMutations = mutations.filter((m) => m.status === 'FAILED');
    if (failedMutations.length === 0) return;
    for (const m of failedMutations) {
      await syncManager.retryMutation(m.id);
    }
    toast.info('Retrying Mutations', `Reset ${failedMutations.length} failed mutation(s) to PENDING`);
    await syncManager.triggerSync();
    await loadTelemetry();
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto py-2">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20 mb-2 shadow-sm">
            <RotateCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Bi-Directional Offline Sync Engine</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Sync & Operations Center</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time telemetry and management for local IndexedDB mutations and cloud reconciliation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Simulate Offline Mode Toggle */}
          <button
            type="button"
            onClick={() => {
              const isSim = syncState.toggleSimulationOffline();
              if (isSim) {
                toast.warning('Simulated Offline Mode', 'Network calls paused. All changes will buffer locally in Outbox.');
              } else {
                toast.success('Online Restored', 'Reconnected. Triggering background synchronization...');
                syncManager.triggerSync();
              }
            }}
            className={`btn-tactile inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer shadow-sm ${
              engineState.isSimulatedOffline
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
                : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:bg-slate-800'
            }`}
            title="Toggle simulated offline mode to test offline behavior without touching Wi-Fi or DevTools"
          >
            <WifiOff className="h-3.5 w-3.5 text-amber-400" />
            <span>{engineState.isSimulatedOffline ? 'Resume Online' : 'Simulate Offline'}</span>
          </button>

          <Tooltip text="Seed test records into local database">
            <button
              type="button"
              onClick={handleSeed}
              className="btn-tactile inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors cursor-pointer shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span>Seed Data</span>
            </button>
          </Tooltip>

          <Tooltip text="Refresh telemetry metrics from IndexedDB">
            <button
              type="button"
              onClick={loadTelemetry}
              className="btn-tactile inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-800 transition-colors cursor-pointer shadow-sm"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </button>
          </Tooltip>

          <Tooltip text="Wipe all local IndexedDB tables">
            <button
              type="button"
              onClick={handleClear}
              className="btn-tactile p-2 rounded-xl text-xs font-semibold bg-slate-900/90 hover:bg-rose-950/40 text-slate-500 hover:text-rose-400 border border-slate-800 hover:border-rose-800/50 transition-colors cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* CENTRAL SYNC HERO CARD (Prompt Section 13) */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800/90 bg-gradient-to-b from-slate-900/80 via-slate-900/60 to-slate-950/90 p-8 sm:p-12 shadow-2xl backdrop-blur-xl card-interactive flex flex-col items-center justify-center text-center space-y-6">
        {/* Soft background ambient glow */}
        <div className="absolute inset-0 pointer-events-none -z-10 flex items-center justify-center" aria-hidden="true">
          <div
            className={`w-80 h-80 rounded-full blur-3xl opacity-20 transition-all duration-700 ${
              !engineState.isOnline
                ? 'bg-amber-500'
                : isSyncing
                ? 'bg-teal-400'
                : engineState.state === SYNC_STATE.CONFLICT
                ? 'bg-amber-500'
                : engineState.state === SYNC_STATE.ERROR
                ? 'bg-rose-500'
                : 'bg-emerald-500'
            }`}
          />
        </div>

        {/* Large Prominent Status Icon */}
        <div className="relative">
          <div
            className={`w-20 h-20 rounded-3xl flex items-center justify-center border shadow-xl transition-all duration-300 ${
              !engineState.isOnline
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : isSyncing
                ? 'bg-teal-500/10 text-teal-300 border-teal-500/30 ring-8 ring-teal-500/10'
                : engineState.state === SYNC_STATE.CONFLICT
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 ring-8 ring-amber-500/10'
                : engineState.state === SYNC_STATE.ERROR
                ? 'bg-rose-500/15 text-rose-400 border-rose-500/30 ring-8 ring-rose-500/10'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 ring-8 ring-emerald-500/10'
            }`}
          >
            {!engineState.isOnline ? (
              <WifiOff className="h-10 w-10 text-amber-400" />
            ) : isSyncing ? (
              <RotateCw className="h-10 w-10 text-teal-400 animate-spin" />
            ) : engineState.state === SYNC_STATE.CONFLICT ? (
              <AlertTriangle className="h-10 w-10 text-amber-400" />
            ) : engineState.state === SYNC_STATE.ERROR ? (
              <AlertTriangle className="h-10 w-10 text-rose-400" />
            ) : (
              <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            )}
          </div>
        </div>

        {/* Status Headline and Context */}
        <div className="space-y-2 max-w-xl">
          <div className="inline-flex items-center gap-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {!engineState.isOnline
                ? 'You are Working Offline'
                : isSyncing
                ? 'Synchronizing with Cloud...'
                : engineState.state === SYNC_STATE.CONFLICT
                ? 'Version Conflict Detected'
                : engineState.state === SYNC_STATE.ERROR
                ? 'Attention: Sync Issues Encountered'
                : mutations.filter((m) => m.status === 'PENDING').length > 0
                ? `${mutations.filter((m) => m.status === 'PENDING').length} Unsent Changes Queued`
                : '✓ Everything is Synced'}
            </h2>
          </div>

          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-lg mx-auto">
            {!engineState.isOnline
              ? 'Changes will be saved locally to IndexedDB and synchronized automatically when your network reconnects.'
              : isSyncing
              ? 'Processing local outbox mutations and reconciling state with Supabase PostgreSQL...'
              : engineState.state === SYNC_STATE.CONFLICT
              ? 'The cloud server detected concurrent updates. Review and resolve the version diffs below.'
              : engineState.state === SYNC_STATE.ERROR
              ? `${stats?.outbox?.failed || 0} mutation(s) encountered validation or transmission errors. You can retry them below.`
              : 'All offline records are fully reconciled with central PostgreSQL database.'}
          </p>

          {engineState.lastSyncAt && (
            <div className="text-xs text-slate-500 font-mono pt-1">
              Last synced: {new Date(engineState.lastSyncAt).toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* Central Primary Action Button */}
        <div className="pt-2">
          <MagneticButton
            onClick={handleManualSync}
            disabled={isSyncing || !engineState.isOnline}
            className={`btn-tactile inline-flex items-center gap-2.5 px-7 py-3 rounded-2xl text-sm font-bold transition-all shadow-xl cursor-pointer ${
              isSyncing || !engineState.isOnline
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                : 'bg-teal-400 hover:bg-teal-300 text-slate-950 border border-teal-300 shadow-teal-500/20 hover:shadow-teal-500/30'
            }`}
          >
            <RotateCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Synchronizing...' : 'Sync Now'}</span>
          </MagneticButton>
        </div>

        {/* Live Sync Progress Bar */}
        {isSyncing && (
          <div className="w-full max-w-md space-y-1.5 pt-2">
            <div className="flex justify-between text-[11px] font-mono text-slate-400">
              <span>Reconciling outbox batch</span>
              <span className="text-teal-400 font-semibold">Active</span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
              <div className="h-full bg-gradient-to-r from-teal-500 to-cyan-400 rounded-full animate-pulse w-4/5 transition-all duration-300" />
            </div>
          </div>
        )}

        {/* Telemetry Summary Strip */}
        {engineState.lastSummary && (
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-mono text-slate-400 bg-slate-950/70 px-5 py-2.5 rounded-full border border-slate-800/80 shadow-inner">
            <div>
              Processed: <span className="text-white font-bold">{engineState.lastSummary.processed}</span>
            </div>
            <span className="text-slate-700">·</span>
            <div>
              Succeeded: <span className="text-emerald-400 font-bold">{engineState.lastSummary.succeeded}</span>
            </div>
            <span className="text-slate-700">·</span>
            <div>
              Conflicts: <span className="text-amber-400 font-bold">{engineState.lastSummary.conflicts}</span>
            </div>
            <span className="text-slate-700">·</span>
            <div>
              Failed: <span className="text-rose-400 font-bold">{engineState.lastSummary.failed}</span>
            </div>
          </div>
        )}
      </div>

      {/* Persistence Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 space-y-1.5 card-interactive shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-emerald-500/40" />
          <span className="text-xs text-slate-400 font-medium">Total Local Projects</span>
          <div className="text-3xl font-extrabold text-white">
            <AnimatedCounter value={stats?.totalProjects ?? 0} />
          </div>
          <span className="text-[11px] text-emerald-400 font-mono font-medium block">IndexedDB: projects</span>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 space-y-1.5 card-interactive shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-teal-500/40" />
          <span className="text-xs text-slate-400 font-medium">Total Local Tasks</span>
          <div className="text-3xl font-extrabold text-white">
            <AnimatedCounter value={stats?.totalTasks ?? 0} />
          </div>
          <span className="text-[11px] text-teal-400 font-mono font-medium block">IndexedDB: tasks</span>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 space-y-1.5 card-interactive shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-cyan-500/40" />
          <span className="text-xs text-slate-400 font-medium">Outbox Queue Buffer</span>
          <div className="text-3xl font-extrabold text-cyan-300">
            <AnimatedCounter value={stats?.outbox?.total ?? 0} />
          </div>
          <span className="text-[11px] text-slate-400 font-mono block">
            {stats?.outbox?.pending ?? 0} Pending · {stats?.outbox?.failed ?? 0} Failed
          </span>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 space-y-1.5 card-interactive shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-amber-500/40" />
          <span className="text-xs text-slate-400 font-medium">Detected Conflicts</span>
          <div className="text-3xl font-extrabold text-amber-400">
            <AnimatedCounter value={conflicts.filter((c) => c.status === 'PENDING').length} />
          </div>
          <span className="text-[11px] text-amber-400/90 font-mono font-medium block">
            {conflicts.filter((c) => c.status === 'PENDING').length > 0
              ? `${conflicts.filter((c) => c.status === 'PENDING').length} requiring review`
              : 'All conflicts resolved'}
          </span>
        </div>
      </div>

      {/* Persistent Conflicts Management Panel */}
      {conflicts.filter((c) => c.status === 'PENDING').length > 0 && (
        <div className="rounded-3xl border border-amber-500/50 bg-amber-950/20 p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <h2 className="text-base font-bold text-white">
                Conflicts Requiring Attention ({conflicts.filter((c) => c.status === 'PENDING').length})
              </h2>
            </div>
            <span className="text-xs text-amber-300/80 font-mono">
              Action needed: Keep Local · Keep Server · Custom Merge
            </span>
          </div>

          <div className="space-y-3">
            {conflicts
              .filter((c) => c.status === 'PENDING')
              .map((conflict) => {
                const local = conflict.local_snapshot || {};
                const server = conflict.server_snapshot || {};
                const diffs = calculateFieldDiffs(local, server);
                const differing = diffs.filter((d) => d.isDifferent);

                return (
                  <div
                    key={conflict.id}
                    className="rounded-2xl border border-amber-500/40 bg-slate-950/80 p-4 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">
                            {local.title || server.title || 'Untitled Task'}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                            Version Conflict (v{conflict.base_version} vs v{conflict.server_version})
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          {differing.length} field(s) diverged between your offline edits and the cloud server.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedConflict(conflict);
                          setIsModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-amber-500 hover:bg-amber-400 transition-colors shadow-md shadow-amber-500/20 cursor-pointer shrink-0"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>Review & Resolve Conflict</span>
                      </button>
                    </div>

                    {/* Summary diff chips */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {differing.map((d) => (
                        <span
                          key={d.field}
                          className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-slate-900 border border-amber-500/30 text-amber-200"
                        >
                          {d.label}: Local "{String(d.localVal)}" ≠ Server "{String(d.serverVal)}"
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Outbox Queue Section */}
      <div className="rounded-3xl border border-slate-800/80 bg-slate-900/40 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400">
              <ListOrdered className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Mutation Outbox Queue Buffer</h3>
              <span className="text-[11px] text-slate-400 font-mono">
                {mutations.filter((m) => m.status === 'PENDING').length} pending · {mutations.filter((m) => m.status === 'FAILED').length} failed · {mutations.length} total
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {mutations.some((m) => m.status === 'FAILED') && (
              <button
                type="button"
                onClick={handleRetryAllFailed}
                className="btn-tactile inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-all cursor-pointer shadow-sm"
              >
                <RotateCw className="h-3 w-3" />
                <span>Retry Failed ({mutations.filter((m) => m.status === 'FAILED').length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleClearCompleted}
              className="btn-tactile px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Clear Completed
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-xs text-slate-400 py-4 text-center">Loading mutations...</div>
        ) : mutations.length === 0 ? (
          <div className="text-xs text-slate-500 py-8 text-center bg-slate-950/40 rounded-2xl border border-slate-800/50">
            Outbox queue is empty. Create or edit projects and tasks to see mutations queued for sync.
          </div>
        ) : (
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {mutations.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white uppercase">{m.operation}</span>
                    <span className="font-mono text-slate-400">[{m.entity_type}]</span>
                    <span className="text-slate-500 font-mono text-[10px]">ID: {m.id.slice(0, 8)}...</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Target: {m.entity_id.slice(0, 8)}... | Attempts: {m.attempt_count}
                    {m.base_version !== null && m.base_version !== undefined && ` | Base v${m.base_version}`}
                    {m.last_error && <span className="text-rose-400 ml-2">Error: {m.last_error}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-mono font-semibold text-[10px] ${
                      m.status === 'COMPLETED'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : m.status === 'PROCESSING'
                        ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20 animate-pulse'
                        : m.status === 'CONFLICT'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : m.status === 'FAILED'
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                    }`}
                  >
                    {m.status}
                  </span>

                  {m.status === 'FAILED' && (
                    <button
                      onClick={() => handleRetryMutation(m.id)}
                      className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-rose-950 text-rose-300 border border-rose-800 hover:bg-rose-900 transition-colors"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolved Conflicts History Audit Log */}
      <div className="rounded-3xl border border-slate-800/80 bg-slate-900/40 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">Resolved Conflicts Audit Log</h3>
            <span className="text-xs text-slate-500 font-mono">
              ({conflicts.filter((c) => c.status === 'RESOLVED').length} resolved)
            </span>
          </div>

          <button
            onClick={() => setShowResolvedHistory(!showResolvedHistory)}
            className="text-xs text-teal-400 hover:text-teal-300 font-semibold transition-colors cursor-pointer"
          >
            {showResolvedHistory ? 'Hide History' : 'View Audit History'}
          </button>
        </div>

        {showResolvedHistory && (
          <div className="space-y-2 pt-2">
            {conflicts.filter((c) => c.status === 'RESOLVED').length === 0 ? (
              <div className="text-xs text-slate-500 py-4 text-center">No resolved conflict history recorded.</div>
            ) : (
              conflicts
                .filter((c) => c.status === 'RESOLVED')
                .map((rc) => (
                  <div
                    key={rc.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs flex items-center justify-between"
                  >
                    <div>
                      <span className="font-semibold text-white">
                        {rc.local_snapshot?.title || rc.server_snapshot?.title || 'Task'}
                      </span>
                      <span className="text-[11px] text-slate-500 ml-2 font-mono">
                        Resolved via <strong>{rc.resolution}</strong> on{' '}
                        {new Date(rc.resolved_at || rc.updated_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full font-mono text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      RESOLVED
                    </span>
                  </div>
                ))
            )}
          </div>
        )}
      </div>

      {/* Local Entity Sync Metadata Breakdown */}
      <div className="rounded-3xl border border-slate-800/80 bg-slate-900/40 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-400" />
            <span>Local Entity Sync Metadata</span>
          </h3>
          <span className="text-xs font-mono text-slate-400">Entity Tables Breakdown</span>
        </div>

        {loading ? (
          <div className="text-xs text-slate-400 py-4">Loading telemetry...</div>
        ) : pending?.totalPending === 0 ? (
          <div className="text-xs text-slate-500 py-6 text-center bg-slate-950/40 rounded-2xl border border-slate-800/50">
            No pending records. Seed demo data or create projects/tasks to inspect local sync metadata.
          </div>
        ) : (
          <div className="space-y-2">
            {pending?.projects.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs flex items-center justify-between"
              >
                <div>
                  <span className="font-semibold text-white">[Project] {p.name}</span>
                  <span className="text-[11px] text-slate-500 ml-2 font-mono">ID: {p.id.slice(0, 8)}...</span>
                </div>
                <span className="px-2 py-0.5 rounded-full font-mono font-semibold text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  {p.sync_status}
                </span>
              </div>
            ))}

            {pending?.tasks.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs flex items-center justify-between"
              >
                <div>
                  <span className="font-semibold text-white">[Task] {t.title}</span>
                  <span className="text-[11px] text-slate-500 ml-2 font-mono">
                    v{t.version} · ID: {t.id.slice(0, 8)}...
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full font-mono font-semibold text-[10px] ${
                    t.sync_status === SYNC_STATUS.CONFLICT
                      ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                      : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                  }`}
                >
                  {t.sync_status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dev Reset */}
      <div className="flex justify-end">
        <button
          onClick={handleClear}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 border border-rose-900/30 transition-colors cursor-pointer"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Wipe Local IndexedDB Database</span>
        </button>
      </div>

      {/* Conflict Resolution Modal */}
      <ConflictResolutionModal
        conflict={selectedConflict}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedConflict(null);
        }}
        onResolved={(strategy) => {
          toast.success('Conflict Resolved', `Resolved using strategy: ${strategy}`);
          loadTelemetry();
        }}
      />
    </div>
  );
}

export default SyncCenterPage;
