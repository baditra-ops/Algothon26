import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Database,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Clock,
  Sparkles,
  Trash2
} from 'lucide-react';
import { getLocalDatabaseStats, getPendingSyncRecords, clearLocalDatabase, seedDevelopmentData } from '../db/devTools';

export function SyncCenterPage() {
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const loadTelemetry = async () => {
    setLoading(true);
    try {
      const s = await getLocalDatabaseStats();
      const p = await getPendingSyncRecords();
      setStats(s);
      setPending(p);
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
    setNotice('Seeded sample projects & tasks into IndexedDB');
    setTimeout(() => setNotice(''), 3000);
    await loadTelemetry();
  };

  const handleClear = async () => {
    if (!window.confirm('Clear all local IndexedDB records?')) return;
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
            <span>Persistence Telemetry · Prompt 4</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Sync & Storage Center</h1>
          <p className="text-sm text-slate-400 mt-1">
            Telemetry monitor for on-device IndexedDB tables and future synchronization metadata.
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
          <span className="text-xs text-slate-400">Pending Sync Items</span>
          <div className="text-2xl font-bold text-amber-300">{pending?.totalPending ?? 0}</div>
          <span className="text-[11px] text-slate-400">Awaiting Prompt 5/6 queue</span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-1">
          <span className="text-xs text-slate-400">Local Storage Engine</span>
          <div className="text-2xl font-bold text-emerald-400">Dexie.js v4</div>
          <span className="text-[11px] text-slate-400">DB: fieldnote_db (v1)</span>
        </div>
      </div>

      {/* Architectural Notice */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>Prompt 4 Architectural Boundary</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          In accordance with the strict roadmap, <strong>no automatic background synchronization</strong> or server polling is performed here.
          All creations, updates, and soft deletions shown in this dashboard are persisted purely on-device in browser IndexedDB.
          Prompt 5 will build the local mutation queue, and Prompt 6/7 will implement the bi-directional conflict-resolution sync engine.
        </p>
      </div>

      {/* Pending Sync Records Inspector */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-400" />
            <span>Local Sync Metadata Breakdown</span>
          </h3>
          <span className="text-xs font-mono text-slate-400">IndexedDB Inspection</span>
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
