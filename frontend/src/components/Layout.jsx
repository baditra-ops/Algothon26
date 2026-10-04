import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { OfflineBanner } from './OfflineBanner';
import { CursorGlow } from './CursorGlow';
import { ToastProvider } from '../context/ToastContext';
import { ShieldCheck, Database, HardDrive } from 'lucide-react';

export function Layout() {
  const location = useLocation();

  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-teal-500/20 selection:text-teal-300 relative overflow-x-hidden bg-grid-subtle">
        {/* Cursor-following ambient radial light */}
        <CursorGlow />

        {/* Ambient background depth gradients */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
          <div className="absolute -top-40 -left-40 w-[32rem] h-[32rem] bg-emerald-500/5 rounded-full blur-3xl"></div>
          <div className="absolute top-1/3 -right-40 w-[32rem] h-[32rem] bg-teal-500/5 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 left-1/3 w-[36rem] h-[36rem] bg-slate-800/10 rounded-full blur-3xl"></div>
        </div>

        {/* Navigation header */}
        <Navbar />

        {/* Offline notification banner */}
        <OfflineBanner />

        {/* Main page content with key-based entrance animation */}
        <main
          key={location.pathname}
          className="flex-1 relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-page-enter"
        >
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="relative z-10 border-t border-slate-900 bg-slate-950/70 backdrop-blur-md py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-slate-300">FIELDNOTE</span>
              <span>—</span>
              <span>Offline-First Field Operations Workspace</span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono">
              <span className="inline-flex items-center gap-1.5 text-slate-400">
                <Database className="h-3 w-3 text-emerald-400" />
                <span>IndexedDB Dexie v3</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-400">
                <HardDrive className="h-3 w-3 text-teal-400" />
                <span>PWA Service Worker</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-400">
                <ShieldCheck className="h-3 w-3 text-cyan-400" />
                <span>Optimistic Concurrency</span>
              </span>
            </div>
          </div>
        </footer>
      </div>
    </ToastProvider>
  );
}

export default Layout;
