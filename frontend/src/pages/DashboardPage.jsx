import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FolderKanban,
  CheckSquare,
  RefreshCw,
  Server,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  Clock,
  Database
} from 'lucide-react';
import { useBackendStatus } from '../hooks/useBackendStatus';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { InstallButton } from '../components/InstallButton';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { getLocalDatabaseStats } from '../db/devTools.js';
import conflictRepository from '../db/repositories/conflictRepository.js';
import outboxRepository from '../db/repositories/outboxRepository.js';
import { syncState, syncManager } from '../sync/index.js';

export function DashboardPage() {
  const { status: backendStatus, data: backendData, error: backendError, refresh: refreshBackend } = useBackendStatus();
  const isOnline = useOnlineStatus();

  const [stats, setStats] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [engineState, setEngineState] = useState(syncState.getState());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState('');

  const loadOperationalState = async () => {
    try {
      const dbStats = await getLocalDatabaseStats();
      setStats(dbStats);

      const pending = await outboxRepository.getPendingMutations();
      setPendingCount(pending.length);

      const conflicts = await conflictRepository.getPendingConflicts();
      setConflictCount(conflicts.length);
    } catch (err) {
      console.error('[Dashboard] Error reading local operational state:', err);
    }
  };

  useEffect(() => {
    loadOperationalState();

    const unsubscribe = syncState.subscribe((next) => {
      setEngineState(next);
      loadOperationalState();
    });

    const interval = setInterval(loadOperationalState, 4000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const handleQuickSync = async () => {
    setIsSyncing(true);
    setSyncNotice('Synchronizing changes...');
    try {
      const res = await syncManager.triggerManualSync();
      if (res?.skipped) {
        setSyncNotice(`Sync skipped: ${res.reason}`);
      } else if (res?.failed) {
        setSyncNotice(`Sync failed: ${res.error}`);
      } else {
        setSyncNotice(`Synced: ${res.succeeded || 0} succeeded, ${res.conflicts || 0} conflicts.`);
      }
    } catch (err) {
      setSyncNotice(`Sync error: ${err.message}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncNotice(''), 3500);
      await loadOperationalState();
    }
  };

  const formatLastSync = (timestamp) => {
    if (!timestamp) return 'Never synced';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="space-y-8 py-2 max-w-7xl mx-auto">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-950 p-6 sm:p-10 shadow-2xl backdrop-blur-md">
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Sparkles className="h-3.5 w-3.5" />
            <span>FIELDNOTE · Offline-First Field Operations Workspace</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
              Work anywhere. Sync when connected.
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Frontline operations workspace engineered for reliable offline execution. All site inspections, checklist tasks, and project edits are persisted instantly in IndexedDB and automatically reconciled upon reconnection.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
              <span className="text-slate-400 font-medium">Status:</span>
              <ConnectionStatus />
            </div>

            <button
              type="button"
              onClick={handleQuickSync}
              disabled={isSyncing || !isOnline}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-950/40 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>

            <InstallButton />
          </div>

          {syncNotice && (
            <div className="text-xs text-cyan-300 bg-cyan-950/40 border border-cyan-800/40 px-3 py-1.5 rounded-lg inline-block animate-fade-in">
              {syncNotice}
            </div>
          )}
        </div>
      </section>

      {/* Operational State Dashboard Metrics */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Database className="h-5 w-5 text-emerald-400" />
            <span>Live Workspace Telemetry</span>
          </h2>
          <span className="text-xs font-mono text-slate-500">
            Last Synced: <strong className="text-slate-300">{formatLastSync(engineState.lastSyncAt)}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Metric 1: Projects */}
          <Link
            to="/projects"
            className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 hover:border-emerald-500/40 hover:bg-slate-900/70 transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Field Projects</span>
              <div className="p-2 rounded-xl bg-slate-800 text-emerald-400 group-hover:scale-105 transition-transform">
                <FolderKanban className="h-4 w-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-white">{stats?.totalProjects ?? 0}</div>
            <span className="text-[11px] text-emerald-400/90 font-medium mt-1 inline-flex items-center gap-1">
              Active workspaces <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          </Link>

          {/* Metric 2: Tasks */}
          <Link
            to="/tasks"
            className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 hover:border-teal-500/40 hover:bg-slate-900/70 transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Field Tasks</span>
              <div className="p-2 rounded-xl bg-slate-800 text-teal-400 group-hover:scale-105 transition-transform">
                <CheckSquare className="h-4 w-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-white">{stats?.totalTasks ?? 0}</div>
            <span className="text-[11px] text-teal-400/90 font-medium mt-1 inline-flex items-center gap-1">
              Inspections & checklists <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          </Link>

          {/* Metric 3: Pending Outbox Changes */}
          <Link
            to="/sync-center"
            className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 hover:border-cyan-500/40 hover:bg-slate-900/70 transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Pending Changes</span>
              <div className="p-2 rounded-xl bg-slate-800 text-cyan-400 group-hover:scale-105 transition-transform">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-cyan-300">{pendingCount}</div>
            <span className="text-[11px] text-slate-400 font-medium mt-1 block">
              {pendingCount > 0 ? 'Queued in outbox' : 'All changes synchronized'}
            </span>
          </Link>

          {/* Metric 4: Concurrency Conflicts */}
          <Link
            to="/sync-center"
            className={`p-5 rounded-2xl border transition-all group ${
              conflictCount > 0
                ? 'border-amber-500/50 bg-amber-950/20 hover:bg-amber-950/30'
                : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Version Conflicts</span>
              <div className={`p-2 rounded-xl ${conflictCount > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'}`}>
                <AlertTriangle className="h-4 w-4" />
              </div>
            </div>
            <div className={`text-3xl font-extrabold ${conflictCount > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-300'}`}>
              {conflictCount}
            </div>
            <span className={`text-[11px] font-medium mt-1 inline-flex items-center gap-1 ${conflictCount > 0 ? 'text-amber-300' : 'text-slate-500'}`}>
              {conflictCount > 0 ? 'Action required in Sync Center ⚠' : 'Zero conflicts detected'}
            </span>
          </Link>
        </div>
      </section>

      {/* Backend API Service Health Indicator */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                backendStatus === 'connected'
                  ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/40'
                  : backendStatus === 'checking'
                  ? 'bg-amber-950/70 text-amber-400 border border-amber-800/40'
                  : 'bg-rose-950/70 text-rose-400 border border-rose-800/40'
              }`}
            >
              <Server className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Central REST API & Supabase PostgreSQL</h3>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    backendStatus === 'connected'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : backendStatus === 'checking'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {backendStatus === 'connected'
                    ? 'Connected'
                    : backendStatus === 'checking'
                    ? 'Probing...'
                    : !isOnline
                    ? 'Offline (Cached App Shell)'
                    : 'Unreachable'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {backendData
                  ? `Service: ${backendData.service} · Status: ${backendData.status} · Optimistic concurrency: Active`
                  : backendError
                  ? `Notice: ${backendError}`
                  : 'Probing Express endpoint GET /api/health...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              onClick={refreshBackend}
              className="text-xs text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              Check Health
            </button>
            <span className="text-[11px] font-mono text-slate-500 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
              GET /api/health
            </span>
          </div>
        </div>
      </section>

      {/* Navigation Modules */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-white">Core Application Modules</h2>
          <p className="text-xs text-slate-400">All workspaces operate with zero UI latency and offline persistence.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Projects */}
          <Link
            to="/projects"
            className="group rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 hover:bg-slate-900/80 hover:border-emerald-500/40 transition-all flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition-transform">
                <FolderKanban className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                Projects Workspace
                <ArrowRight className="h-4 w-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Create and organize field project sites, inspect documentation, and assign site audits.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
              <span>{stats?.totalProjects ?? 0} projects</span>
              <span className="text-emerald-400 font-medium">Dexie IndexedDB</span>
            </div>
          </Link>

          {/* Card 2: Tasks */}
          <Link
            to="/tasks"
            className="group rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 hover:bg-slate-900/80 hover:border-teal-500/40 transition-all flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="inline-flex p-3 rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/20 group-hover:scale-105 transition-transform">
                <CheckSquare className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-white group-hover:text-teal-400 transition-colors flex items-center gap-1.5">
                Tasks & Inspections
                <ArrowRight className="h-4 w-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Execute checklist items, advance lifecycle statuses, set priorities, and resolve version conflicts.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
              <span>{stats?.totalTasks ?? 0} tasks</span>
              <span className="text-teal-400 font-medium">Optimistic versioning</span>
            </div>
          </Link>

          {/* Card 3: Sync Center */}
          <Link
            to="/sync-center"
            className="group rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 hover:bg-slate-900/80 hover:border-cyan-500/40 transition-all flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="inline-flex p-3 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 group-hover:scale-105 transition-transform">
                <RefreshCw className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-white group-hover:text-cyan-400 transition-colors flex items-center gap-1.5">
                Sync Control Center
                <ArrowRight className="h-4 w-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Monitor mutation outbox queue, inspect pending writes, resolve HTTP 409 conflicts, and trigger manual sync.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
              <span>{pendingCount} pending · {conflictCount} conflicts</span>
              <span className="text-cyan-400 font-medium">Sync Engine</span>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}

export default DashboardPage;
