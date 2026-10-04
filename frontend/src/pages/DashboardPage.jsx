import React from 'react';
import { Link } from 'react-router-dom';
import {
  Wifi,
  Database,
  ArrowRight,
  FolderKanban,
  CheckSquare,
  RefreshCw,
  Server,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useBackendStatus } from '../hooks/useBackendStatus';

export function DashboardPage() {
  const { status: backendStatus, data: backendData, error: backendError, refresh } = useBackendStatus();

  return (
    <div className="space-y-12 py-2">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-b from-slate-900/90 to-slate-950/80 p-8 sm:p-12 shadow-2xl backdrop-blur-sm">
        <div className="max-w-3xl space-y-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Problem Statement ALG-WEB-02 · Hackathon Prototype</span>
          </div>

          {/* Title & Tagline */}
          <div className="space-y-3">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white">
              FIELDNOTE
            </h1>
            <p className="text-xl sm:text-2xl font-semibold bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              Work anywhere. Sync when connected.
            </p>
          </div>

          {/* Description */}
          <p className="text-base sm:text-lg text-slate-300 leading-relaxed font-normal">
            FIELDNOTE is an offline-first workspace engineered for field engineers, audit teams, and remote operations.
            The application is designed to continue working seamlessly even when network connectivity is intermittent or completely unavailable,
            safely capturing changes and orchestrating reliable synchronization once reconnected.
          </p>

          {/* Status Indicator Callout */}
          <div className="pt-2 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 shadow-inner">
              <span className="text-xs font-medium text-slate-400">Current Connectivity:</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/90 text-emerald-400 border border-emerald-700/60">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                ● Online
              </span>
              <span className="text-[11px] text-slate-500 italic hidden sm:inline">
                (Visual placeholder · Dynamic detection in Prompt 2)
              </span>
            </div>

            <button
              onClick={refresh}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Verify Backend API</span>
            </button>
          </div>
        </div>
      </section>

      {/* Backend API Health Status Verification Banner */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${backendStatus === 'connected' ? 'bg-emerald-950/70 text-emerald-400' : backendStatus === 'checking' ? 'bg-amber-950/70 text-amber-400' : 'bg-rose-950/70 text-rose-400'}`}>
              <Server className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">REST API Service Status</h3>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${backendStatus === 'connected' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : backendStatus === 'checking' ? 'bg-amber-500/20 text-amber-300' : 'bg-rose-500/20 text-rose-400'}`}>
                  {backendStatus === 'connected' ? 'Active & Responding' : backendStatus === 'checking' ? 'Checking /api/health...' : 'Unreachable'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {backendData ? `Connected to ${backendData.service} · Status: ${backendData.status} · Timestamp: ${backendData.timestamp}` : backendError ? `Connection failed: ${backendError}` : 'Probing Express endpoint GET /api/health...'}
              </p>
            </div>
          </div>

          <div className="text-xs text-slate-500 font-mono bg-slate-950 px-3 py-1.5 rounded-md border border-slate-800 self-start sm:self-center">
            GET /api/health
          </div>
        </div>
      </section>

      {/* Navigation Feature Cards */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Application Modules</h2>
          <p className="text-sm text-slate-400">Foundational navigation structure ready for upcoming offline modules.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Projects */}
          <Link
            to="/projects"
            className="group relative rounded-xl border border-slate-800/80 bg-slate-900/40 p-6 hover:bg-slate-900/80 hover:border-slate-700 transition-all duration-200 flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="inline-flex p-3 rounded-xl bg-slate-800/80 text-emerald-400 group-hover:scale-105 transition-transform">
                <FolderKanban className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                Projects
                <ArrowRight className="h-4 w-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Field project workspaces, site documentation, and operational assignments accessible offline.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
              <span>Section ready</span>
              <span className="text-emerald-400 font-medium">Foundation active</span>
            </div>
          </Link>

          {/* Card 2: Tasks */}
          <Link
            to="/tasks"
            className="group relative rounded-xl border border-slate-800/80 bg-slate-900/40 p-6 hover:bg-slate-900/80 hover:border-slate-700 transition-all duration-200 flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="inline-flex p-3 rounded-xl bg-slate-800/80 text-teal-400 group-hover:scale-105 transition-transform">
                <CheckSquare className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-white group-hover:text-teal-400 transition-colors flex items-center gap-1.5">
                Tasks
                <ArrowRight className="h-4 w-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Action checklists and field logs that can be created, edited, and completed with zero network lag.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
              <span>Section ready</span>
              <span className="text-teal-400 font-medium">Foundation active</span>
            </div>
          </Link>

          {/* Card 3: Sync Center */}
          <Link
            to="/sync-center"
            className="group relative rounded-xl border border-slate-800/80 bg-slate-900/40 p-6 hover:bg-slate-900/80 hover:border-slate-700 transition-all duration-200 flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="inline-flex p-3 rounded-xl bg-slate-800/80 text-cyan-400 group-hover:scale-105 transition-transform">
                <RefreshCw className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-white group-hover:text-cyan-400 transition-colors flex items-center gap-1.5">
                Sync Center
                <ArrowRight className="h-4 w-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Mutation queue monitor, conflict resolution logs, and upstream state reconciliation telemetry.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
              <span>Section ready</span>
              <span className="text-cyan-400 font-medium">Foundation active</span>
            </div>
          </Link>
        </div>
      </section>

      {/* Architectural Roadmap Pipeline */}
      <section className="rounded-2xl border border-slate-800/80 bg-slate-900/30 p-6 sm:p-8 backdrop-blur-sm space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-emerald-400" />
              <span>Target Architectural Pipeline</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Planned end-to-end flow adhering to the strict incremental roadmap.
            </p>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
            Phase 1 of 5
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { step: '01', title: 'React + Vite', desc: 'Frontend Client Shell', state: 'active' },
            { step: '02', title: 'PWA / SW', desc: 'Asset Caching Layer', state: 'planned' },
            { step: '03', title: 'IndexedDB', desc: 'Dexie.js Client Storage', state: 'planned' },
            { step: '04', title: 'Offline Queue', desc: 'Conflict-Free Sync Engine', state: 'planned' },
            { step: '05', title: 'Express API', desc: 'Node.js REST Services', state: 'active' },
            { step: '06', title: 'PostgreSQL', desc: 'Supabase Cloud Store', state: 'planned' },
          ].map((item) => (
            <div
              key={item.step}
              className={`rounded-xl p-3.5 border flex flex-col justify-between ${
                item.state === 'active'
                  ? 'border-emerald-500/40 bg-emerald-950/20'
                  : 'border-slate-800/60 bg-slate-900/20 opacity-70'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className={item.state === 'active' ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                    {item.step}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${item.state === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                    {item.state === 'active' ? 'Built' : 'Next'}
                  </span>
                </div>
                <div className="text-xs font-bold text-white mt-1">{item.title}</div>
                <div className="text-[11px] text-slate-400 leading-tight">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
