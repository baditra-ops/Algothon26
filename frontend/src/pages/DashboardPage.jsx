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
  Database,
  CheckCircle2,
  Circle,
  Plus
} from 'lucide-react';
import { useBackendStatus } from '../hooks/useBackendStatus';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { InstallButton } from '../components/InstallButton';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { getLocalDatabaseStats } from '../db/devTools.js';
import conflictRepository from '../db/repositories/conflictRepository.js';
import outboxRepository from '../db/repositories/outboxRepository.js';
import { taskRepository } from '../db/repositories/taskRepository.js';
import { syncState, syncManager } from '../sync/index.js';
import { MagneticButton } from '../components/MagneticButton';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { useToast } from '../context/ToastContext';

export function DashboardPage() {
  const { status: backendStatus, refresh: refreshBackend } = useBackendStatus();
  const isOnline = useOnlineStatus();
  const toast = useToast();

  const [stats, setStats] = useState(null);
  const [recentTasks, setRecentTasks] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [engineState, setEngineState] = useState(syncState.getState());
  const [isSyncing, setIsSyncing] = useState(false);

  const loadOperationalState = async () => {
    try {
      const dbStats = await getLocalDatabaseStats();
      setStats(dbStats);

      const tasks = await taskRepository.getAllTasks();
      setRecentTasks(tasks.slice(0, 4));

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
    try {
      const res = await syncManager.triggerManualSync();
      if (res?.skipped) {
        toast.warning('Sync Skipped', `Engine status: ${res.reason}`);
      } else if (res?.failed) {
        toast.error('Sync Encountered Error', res.error || 'Failed to reach cloud database');
      } else if (res?.conflicts > 0) {
        toast.warning('Conflict Detected', `${res.conflicts} concurrency conflict(s) require review`);
      } else {
        toast.success('Synchronization Complete', `${res.succeeded || 0} change(s) synced with central database`);
      }
    } catch (err) {
      toast.error('Sync Error', err.message);
    } finally {
      setIsSyncing(false);
      await loadOperationalState();
    }
  };

  const formatLastSync = (timestamp) => {
    if (!timestamp) return 'Never synced';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="space-y-8 py-2 max-w-7xl mx-auto">
      {/* Hero Section (Section 31 Target Mockup) */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-800/90 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950 p-6 sm:p-10 shadow-2xl backdrop-blur-xl transition-all card-interactive">
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20 shadow-xs">
            <Sparkles className="h-3.5 w-3.5 text-teal-300" />
            <span>FIELDNOTE · Offline-First Field Operations Workspace</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
              {getGreeting()}. <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-300 via-emerald-400 to-teal-500">Your workspace is active.</span>
            </h1>
            <p className="text-sm sm:text-base text-slate-300/90 leading-relaxed font-normal">
              Field checklists, inspections, and project notes commit instantly to local IndexedDB with atomic outbox queuing. Reconciles transparently when connected.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs shadow-xs">
              <span className="text-slate-400 font-medium">Status:</span>
              <ConnectionStatus />
            </div>

            <MagneticButton
              onClick={handleQuickSync}
              disabled={isSyncing || !engineState.isOnline}
              className="btn-tactile inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-teal-400 hover:bg-teal-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-teal-950/40 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </MagneticButton>

            <Link
              to="/projects"
              className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-colors cursor-pointer shadow-sm"
            >
              <Plus className="h-3.5 w-3.5 text-teal-400" />
              <span>New Project</span>
            </Link>

            <Link
              to="/tasks"
              className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-colors cursor-pointer shadow-sm"
            >
              <Plus className="h-3.5 w-3.5 text-emerald-400" />
              <span>Add Task</span>
            </Link>

            <InstallButton />
          </div>
        </div>
      </section>

      {/* Operational State Dashboard Metrics */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Database className="h-5 w-5 text-teal-400" />
            <span>Live Workspace Telemetry</span>
          </h2>
          <span className="text-xs font-mono text-slate-500">
            Last Synced: <strong className="text-slate-300 font-semibold">{formatLastSync(engineState.lastSyncAt)}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Metric 1: Projects */}
          <Link
            to="/projects"
            className="p-5 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-emerald-500/40 hover:bg-slate-900/70 card-interactive group relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-emerald-500/40" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Field Projects</span>
              <div className="p-2 rounded-xl bg-slate-800 text-emerald-400 group-hover:scale-110 transition-transform">
                <FolderKanban className="h-4 w-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-white">
              <AnimatedCounter value={stats?.totalProjects ?? 0} />
            </div>
            <span className="text-[11px] text-emerald-400/90 font-medium mt-1 inline-flex items-center gap-1">
              Active workspaces <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </span>
          </Link>

          {/* Metric 2: Tasks */}
          <Link
            to="/tasks"
            className="p-5 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-teal-500/40 hover:bg-slate-900/70 card-interactive group relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-teal-500/40" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Field Tasks</span>
              <div className="p-2 rounded-xl bg-slate-800 text-teal-400 group-hover:scale-110 transition-transform">
                <CheckSquare className="h-4 w-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-white">
              <AnimatedCounter value={stats?.totalTasks ?? 0} />
            </div>
            <span className="text-[11px] text-teal-400/90 font-medium mt-1 inline-flex items-center gap-1">
              Checklists & inspections <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </span>
          </Link>

          {/* Metric 3: Pending Outbox Changes */}
          <Link
            to="/sync-center"
            className="p-5 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-cyan-500/40 hover:bg-slate-900/70 card-interactive group relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-cyan-500/40" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Pending Changes</span>
              <div className="p-2 rounded-xl bg-slate-800 text-cyan-400 group-hover:scale-110 transition-transform">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-cyan-300">
              <AnimatedCounter value={pendingCount} />
            </div>
            <span className="text-[11px] text-slate-400 font-medium mt-1 block">
              {pendingCount > 0 ? `${pendingCount} mutation(s) in outbox` : 'All changes synchronized'}
            </span>
          </Link>

          {/* Metric 4: Concurrency Conflicts */}
          <Link
            to="/sync-center"
            className={`p-5 rounded-2xl border card-interactive group relative overflow-hidden ${
              conflictCount > 0
                ? 'border-amber-500/60 bg-amber-950/20 hover:bg-amber-950/30'
                : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
            }`}
          >
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-amber-500/40" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Version Conflicts</span>
              <div className={`p-2 rounded-xl ${conflictCount > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'}`}>
                <AlertTriangle className="h-4 w-4" />
              </div>
            </div>
            <div className={`text-3xl font-extrabold ${conflictCount > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-300'}`}>
              <AnimatedCounter value={conflictCount} />
            </div>
            <span className={`text-[11px] font-medium mt-1 inline-flex items-center gap-1 ${conflictCount > 0 ? 'text-amber-300' : 'text-slate-500'}`}>
              {conflictCount > 0 ? 'Action required in Sync Center ⚠' : 'Zero conflicts detected'}
            </span>
          </Link>
        </div>
      </section>

      {/* Recent Field Inspections Section (Prompt Section 31 Mockup) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-teal-400" />
            <h2 className="text-lg font-bold text-white tracking-tight">Recent Field Tasks</h2>
          </div>
          <Link
            to="/tasks"
            className="text-xs font-semibold text-teal-400 hover:text-teal-300 inline-flex items-center gap-1 group"
          >
            <span>View All Tasks</span>
            <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {recentTasks.length === 0 ? (
          <div className="p-8 rounded-2xl border border-slate-800/80 bg-slate-900/30 text-center text-xs text-slate-500">
            No tasks logged yet. Create a task or seed demo data to populate this list.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {recentTasks.map((t) => (
              <div
                key={t.id}
                className="p-4 rounded-2xl border border-slate-800/80 bg-slate-900/50 card-interactive flex items-center justify-between gap-3 shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`p-1.5 rounded-lg ${t.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                    {t.status === 'COMPLETED' ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className={`text-xs font-bold block truncate ${t.status === 'COMPLETED' ? 'line-through text-slate-400' : 'text-white'}`}>
                      {t.title}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Priority: {t.priority} · v{t.version}
                    </span>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                    t.sync_status === 'SYNCED'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : t.sync_status === 'CONFLICT'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-teal-500/10 text-teal-300 border border-teal-500/30'
                  }`}
                >
                  ● {t.sync_status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Backend API Service Health Indicator */}
      <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 backdrop-blur-sm card-interactive">
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
                {backendStatus === 'connected'
                  ? 'Connected to Express backend. PostgreSQL pooling active with Supabase.'
                  : !isOnline
                  ? 'Device is disconnected. Client-side IndexedDB serves all requests.'
                  : 'Backend server is unavailable. Local mutations remain safely buffered in Outbox.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={refreshBackend}
            className="self-start sm:self-center px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
          >
            Check Health
          </button>
        </div>
      </section>

      {/* Quick Action Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          to="/projects"
          className="p-6 rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-900/60 to-slate-950/60 card-interactive group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-3 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 group-hover:scale-105 transition-transform">
              <FolderKanban className="h-6 w-6" />
            </div>
            <ArrowRight className="h-5 w-5 text-slate-500 group-hover:text-teal-400 group-hover:translate-x-1 transition-all" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">Field Projects</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Create and organize field engineering project directories, assign tasks, and track local synchronization status.
          </p>
        </Link>

        <Link
          to="/tasks"
          className="p-6 rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-900/60 to-slate-950/60 card-interactive group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition-transform">
              <CheckSquare className="h-6 w-6" />
            </div>
            <ArrowRight className="h-5 w-5 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">Inspection Tasks</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Execute inspection checklists, update operational statuses, change priorities, and manage offline field observations.
          </p>
        </Link>
      </section>
    </div>
  );
}

export default DashboardPage;
