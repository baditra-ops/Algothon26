import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Home } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="max-w-md mx-auto py-16 text-center space-y-6">
      <div className="inline-flex p-4 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
        <AlertTriangle className="h-10 w-10" />
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-white">404 - Page Not Found</h1>
        <p className="text-sm text-slate-400">
          The requested page route does not exist in this FIELDNOTE build.
        </p>
      </div>
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-colors"
        >
          <Home className="h-4 w-4" />
          <span>Return to Dashboard</span>
        </Link>
      </div>
    </div>
  );
}
