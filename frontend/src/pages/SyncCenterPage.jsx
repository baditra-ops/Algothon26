import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Database,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Clock,
  Sparkles,
  Trash2,
  ListOrdered,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Wifi,
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
import ConflictResolutionModal from '../components/ConflictResolutionModal.jsx';

export function SyncCenterPage() {
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState(null);
  const [mutations, setMutations] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
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
    setNotice('Triggering synchronization cycle...');
    try {
      const res = await syncManager.triggerManualSync();
      if (res?.skipped) {
        setNotice(`Sync skipped: ${res.reason}`);
      } else if (res?.failed) {
        setNotice(`Sync failed: ${res.error}`);
      } else {
        setNotice(
          `Sync complete: ${res.succeeded || 0} succeeded, ${res.conflicts || 0} conflicts, ${res.failed || 0} failed.`
        );
      }
    } catch (err) {
      setNotice(`Sync error: ${err.message}`);
    }
    setTimeout(() => setNotice(''), 4000);
    await loadTelemetry();
  };

  const handleRetryMutation = async (id) => {
    await syncManager.retryMutation(id);
    setNotice('Mutation reset to PENDING and sync requested');
    setTimeout(() => setNotice(''), 3000);
    await loadTelemetry();
  };

  const handleSeed = async () => {
    await seedDevelopmentData();
    setNotice('Seeded sample projects & tasks into IndexedDB with outbox entries');
    setTimeout(() => setNotice(''), 3000);
    await loadTelemetry();
  };

  const handleClearCompleted = async () => {
    const count = await clearCompletedMutations();
    setNotice(`Cleared ${count} completed mutation(s) from outbox`);
    setTimeout(() => setNotice(''), 3000);
    await loadTelemetry();
  };

  const handleClear = async () => {
    if (!window.confirm('Clear all local IndexedDB records (projects, tasks, outbox, and conflicts)?')) return;
    await clearLocalDatabase();
    setNotice('Local IndexedDB cleared');
    setTimeout(() => setNotice(''), 3000);
    await loadTelemetry();
  };

  const isSyncing = engineState.state === SYNC_STATE.SYNCING;

  return (
    <div className="space-y-8 max-w-7xl mx-auto py-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-2">
            <RotateCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Synchronization Engine · Prompt 6</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Sync & Operations Center</h1>
          <p className="text-sm text-slate-400 mt-1">
            Bi-directional synchronization engine between local IndexedDB and central REST API.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sync Now Action */}
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing || !engineState.isOnline}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer ${
              isSyncing || !engineState.isOnline
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 border border-cyan-400'
            }`}
          >
            <RotateCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Synchronizing...' : 'Sync Now'}</span>
          </button>

          <button
            type="button"
            onClick={handleSeed}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>Seed Demo</span>
          </button>

          <button
            type="button"
            onClick={loadTelemetry}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/40 px-4 py-2.5 text-xs text-cyan-300">
          {notice}
        </div>
      )}

      {/* Sync Engine Telemetry Status Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-xl border ${
              engineState.isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}
          >
            {engineState.isOnline ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">
                Engine Status: {engineState.state}
              </span>
              <span
                className={`px-2 py-0.5 rounded font-mono font-semibold text-[10px] ${
                  engineState.state === SYNC_STATE.SYNCING
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 animate-pulse'
                    : engineState.state === SYNC_STATE.CONFLICT
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : engineState.state === SYNC_STATE.ERROR
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    : engineState.state === SYNC_STATE.OFFLINE
                    ? 'bg-slate-700 text-slate-300'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}
              >
                {engineState.state}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {engineState.isOnline ? 'Online · Auto-sync active' : 'Offline · Mutations queued locally'}
              {engineState.lastSyncAt && ` · Last synced: ${new Date(engineState.lastSyncAt).toLocaleTimeString()}`}
            </p>
          </div>
        </div>

        {engineState.lastSummary && (
          <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
            <div>
              Processed: <span className="text-white font-bold">{engineState.lastSummary.processed}</span>
            </div>
            <div>
              Succeeded: <span className="text-emerald-400 font-bold">{engineState.lastSummary.succeeded}</span>
            </div>
            <div>
              Conflicts: <span className="text-amber-400 font-bold">{engineState.lastSummary.conflicts}</span>
            </div>
            <div>
              Failed: <span className="text-rose-400 font-bold">{engineState.lastSummary.failed}</span>
            </div>
          </div>
        )}
      </div>

      {/* Persistence Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-1">
          <span className="text-xs text-slate-400">Total Local Projects</span>
          <div className="text-2xl font-bold text-white">{stats?.totalProjects ?? 0}</div>
          <span className="text-[11px] text-emerald-400">IndexedDB: projects</span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-1">
          <span className="text-xs text-slate-400">Total Local Tasks</span>
          <div className="text-2xl font-bold text-white">{stats?.totalTasks ?? 0}</div>
          <span className="text-[11px] text-teal-400">IndexedDB: tasks</span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-1">
          <span className="text-xs text-slate-400">Outbox Queue Buffer</span>
          <div className="text-2xl font-bold text-cyan-300">{stats?.outbox?.total ?? 0}</div>
          <span className="text-[11px] text-slate-400">
            {stats?.outbox?.pending ?? 0} Pending · {stats?.outbox?.failed ?? 0} Failed
          </span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-1">
          <span className="text-xs text-slate-400">Detected Conflicts</span>
          <div className="text-2xl font-bold text-amber-400">
            {conflicts.filter((c) => c.status === 'PENDING').length}
          </div>
          <span className="text-[11px] text-amber-400/80">
            {conflicts.filter((c) => c.status === 'PENDING').length > 0
              ? `${conflicts.filter((c) => c.status === 'PENDING').length} requiring attention`
              : 'All conflicts resolved'}
          </span>
        </div>
      </div>

      {/* Conflicts Requiring Attention */}
      {conflicts.filter((c) => c.status === 'PENDING').length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Conflicts Requiring Attention ({conflicts.filter((c) => c.status === 'PENDING').length})
                </h3>
                <span className="text-xs text-amber-300">
                  HTTP 409 Optimistic Version Divergence Detected
                </span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Needs User Decision
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            These tasks were updated concurrently by another user while you worked offline. FIELDNOTE preserved both versions without overwriting any data.
            Review each conflict to choose Keep Local, Keep Server, or Custom Merge.
          </p>

          <div className="space-y-3">
            {conflicts
              .filter((c) => c.status === 'PENDING')
              .map((c) => {
                const diffs = calculateFieldDiffs(c.local_snapshot, c.server_snapshot);
                const diffFields = diffs.filter((d) => d.isDifferent).map((d) => d.label);

                return (
                  <div
                    key={c.id}
                    className="rounded-xl border border-amber-500/30 bg-slate-950 p-4 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">
                            {c.local_snapshot?.title || c.server_snapshot?.title || 'Untitled Task'}
                          </span>
                          <span className="px-2 py-0.5 rounded font-mono font-semibold text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            {c.status}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
                          <span>Entity: {c.entity_id.slice(0, 8)}...</span>
                          <span>·</span>
                          <span className="text-cyan-400">Local Base: v{c.base_version ?? 0}</span>
                          <span>·</span>
                          <span className="text-emerald-400">Server: v{c.server_version ?? 1}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedConflict(c);
                          setIsModalOpen(true);
                        }}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-500 hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20 cursor-pointer shrink-0"
                      >
                        <AlertTriangle className="h-4 w-4" />
                        <span>Review & Resolve Conflict</span>
                      </button>
                    </div>

                    {diffFields.length > 0 && (
                      <div className="pt-2 border-t border-slate-900 flex items-center gap-2 text-xs">
                        <span className="text-slate-500 font-medium">Conflicting Fields:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {diffFields.map((f) => (
                            <span
                              key={f}
                              className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-950/60 text-amber-300 border border-amber-900/50"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Resolved Conflicts History (Collapsible) */}
      {conflicts.filter((c) => c.status === 'RESOLVED').length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowResolvedHistory(!showResolvedHistory)}
              className="text-xs font-semibold text-slate-400 hover:text-slate-200 flex items-center gap-1.5 cursor-pointer"
            >
              <span>{showResolvedHistory ? '▼' : '▶'}</span>
              <span>Resolved Conflicts History ({conflicts.filter((c) => c.status === 'RESOLVED').length})</span>
            </button>
            <span className="text-[11px] text-slate-500 font-mono">Audit Log</span>
          </div>

          {showResolvedHistory && (
            <div className="space-y-2 pt-2">
              {conflicts
                .filter((c) => c.status === 'RESOLVED')
                .map((rc) => (
                  <div
                    key={rc.id}
                    className="p-3 rounded-lg bg-slate-950 border border-slate-850 text-xs flex items-center justify-between"
                  >
                    <div>
                      <span className="font-semibold text-slate-300">
                        {rc.local_snapshot?.title || rc.server_snapshot?.title || 'Task'}
                      </span>
                      <span className="text-slate-500 ml-2 font-mono">
                        v{rc.base_version} → v{rc.server_version}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                        {rc.resolution}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(rc.resolved_at || rc.updated_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Outbox Mutation Queue Inspector */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <ListOrdered className="h-4 w-4 text-cyan-400" />
            <span>Outbox Mutation Queue ({mutations.length})</span>
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={handleClearCompleted}
              disabled={!(stats?.outbox?.completed > 0)}
              className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:hover:text-slate-400 cursor-pointer"
            >
              Clear Completed
            </button>
            <span className="text-xs font-mono text-slate-400">IndexedDB: outbox</span>
          </div>
        </div>

        {loading ? (
          <div className="text-xs text-slate-400">Loading outbox mutations...</div>
        ) : mutations.length === 0 ? (
          <div className="text-xs text-slate-500 py-4 text-center">
            Outbox queue is empty. Create, edit, or delete projects and tasks to inspect atomic mutations.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {mutations.map((m) => (
              <div
                key={m.id}
                className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white uppercase tracking-wider text-[11px]">
                      [{m.entity_type}]
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-mono font-semibold text-[10px] ${
                        m.operation === 'CREATE'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : m.operation === 'UPDATE'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      {m.operation}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Target: {m.entity_id.slice(0, 8)}...
                    </span>
                    {m.base_version !== null && (
                      <span className="text-[10px] text-cyan-400 font-mono">
                        base_v{m.base_version}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono truncate max-w-md">
                    IdempotencyKey: {m.idempotency_key.slice(0, 16)}... · Attempts: {m.attempt_count}
                    {m.last_error && <span className="text-rose-400 ml-2">({m.last_error})</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded font-mono font-semibold text-[10px] ${
                      m.status === 'PENDING'
                        ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                        : m.status === 'PROCESSING'
                        ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                        : m.status === 'COMPLETED'
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                        : m.status === 'CONFLICT'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                    }`}
                  >
                    {m.status}
                  </span>

                  {m.status === 'FAILED' && (
                    <button
                      onClick={() => handleRetryMutation(m.id)}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
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

      {/* Pending Sync Records Inspector */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-400" />
            <span>Local Entity Sync Metadata</span>
          </h3>
          <span className="text-xs font-mono text-slate-400">Entity Tables Breakdown</span>
        </div>

        {loading ? (
          <div className="text-xs text-slate-400">Loading telemetry...</div>
        ) : pending?.totalPending === 0 ? (
          <div className="text-xs text-slate-500 py-4 text-center">
            No pending records. Seed demo data or create projects/tasks to inspect local sync metadata.
          </div>
        ) : (
          <div className="space-y-2">
            {pending?.projects.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs flex items-center justify-between"
              >
                <div>
                  <span className="font-semibold text-white">[Project] {p.name}</span>
                  <span className="text-[11px] text-slate-500 ml-2 font-mono">ID: {p.id.slice(0, 8)}...</span>
                </div>
                <span className="px-2 py-0.5 rounded font-mono font-semibold text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  {p.sync_status}
                </span>
              </div>
            ))}

            {pending?.tasks.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs flex items-center justify-between"
              >
                <div>
                  <span className="font-semibold text-white">[Task] {t.title}</span>
                  <span className="text-[11px] text-slate-500 ml-2 font-mono">
                    v{t.version} · ID: {t.id.slice(0, 8)}...
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded font-mono font-semibold text-[10px] ${
                    t.sync_status === SYNC_STATUS.CONFLICT
                      ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
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
          setNotice(`Conflict resolved using ${strategy}. Synchronization updated.`);
          setTimeout(() => setNotice(''), 4000);
          loadTelemetry();
        }}
      />
    </div>
  );
}


