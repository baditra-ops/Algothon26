import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, ShieldAlert } from 'lucide-react';

export function SectionPlaceholder({ title, description, icon: Icon, plannedFeatures = [] }) {
  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      <div className="flex items-center gap-3 text-sm text-slate-400">
        <Link to="/" className="inline-flex items-center gap-1.5 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Dashboard</span>
        </Link>
        <span>/</span>
        <span className="text-slate-200">{title}</span>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 sm:p-10 backdrop-blur-sm space-y-6">
        <div className="flex items-start gap-4">
          <div className="p-3.5 rounded-xl bg-slate-800 text-emerald-400 border border-slate-700">
            <Icon className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20 mb-1">
              <Clock className="h-3 w-3" />
              <span>Foundation Scaffolded · Functionality in upcoming prompts</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{title}</h1>
            <p className="text-sm sm:text-base text-slate-400">{description}</p>
          </div>
        </div>

        {plannedFeatures.length > 0 && (
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Planned Capabilities (Upcoming Stages)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {plannedFeatures.map((feat, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 text-xs text-slate-300 flex items-center gap-2.5"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 flex items-start gap-3 text-xs text-slate-400">
          <ShieldAlert className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
          <p>
            In accordance with Prompt 1 constraints, offline storage engines (Dexie/IndexedDB), Service Worker caches, and mutation sync channels will be added in subsequent implementation phases.
          </p>
        </div>
      </div>
    </div>
  );
}
