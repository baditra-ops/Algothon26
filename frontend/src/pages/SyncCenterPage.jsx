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
  AlertTriangle
} from 'lucide-react';
import {
  getLocalDatabaseStats,
  getPendingSyncRecords,
  getOutboxMutations,
  clearCompletedMutations,
  clearLocalDatabase,
  seedDevelopmentData
} from '../db/devTools';

export function SyncCenterPage() {
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState(null);
  const [mutations, setMutations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const loadTelemetry = async () => {
    setLoading(true);
    try {
      const s = await getLocalDatabaseStats();
      const p = await getPendingSyncRecords();
      const m = await getOutboxMutations();
      setStats(s);
      setPending(p);
      setMutations(m);
    } catch (err) {
      console.error('[SyncCenter] Error loading telemetry:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTelemetry();
  }, []);

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
    if (!window.confirm('Clear all local IndexedDB records (projects, tasks, and outbox)?')) return;
    await clearLocalDatabase();
    setNotice('Local IndexedDB cleared');
    setTimeout(() => setNotice(''), 3000);
    await loadTelemetry();
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto py-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-2">
            <RefreshCw className="h-3 w-3" />
            <span>Local Mutation Queue · Prompt 5</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Sync & Outbox Center</h1>
          <p className="text-sm text-slate-400 mt-1">
            Telemetry monitor for on-device IndexedDB tables and durable mutation queue buffer.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSeed}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>Seed Demo Data</span>
          </button>

          <button
            type="button"
            onClick={loadTelemetry}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh Stats</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/40 px-4 py-2.5 text-xs text-cyan-300">
          {notice}
        </div>
      )}

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
          <span className="text-xs text-slate-400">Local Storage Engine</span>
          <div className="text-2xl font-bold text-emerald-400">Dexie.js v4</div>
          <span className="text-[11px] text-slate-400">DB: fieldnote_db (v2)</span>
        </div>
      </div>

      {/* Architectural Notice */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>Prompt 5 Architectural Boundary</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          In accordance with the strict roadmap, <strong>no automatic background synchronization</strong> or network requests occur here.
          All local operations are recorded in an atomic Dexie transaction spanning entity tables and the <code>outbox</code> mutation buffer.
          Prompt 6 will implement the synchronization engine that consumes this outbox and reconciles with the central Express/Supabase backend.
        </p>
      </div>

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
                        : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                    }`}
                  >
                    {m.status}
                  </span>
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
                <span className="px-2 py-0.5 rounded font-mono font-semibold text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/20">
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
    </div>
  );
}

