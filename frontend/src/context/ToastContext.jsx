import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(({ title, message, type = 'info', duration = 3500 }) => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev.slice(-3), { id, title, message, type }]); // Keep at most 4 toasts

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const toast = {
    success: (title, message) => addToast({ title, message, type: 'success' }),
    warning: (title, message) => addToast({ title, message, type: 'warning' }),
    error: (title, message) => addToast({ title, message, type: 'error' }),
    info: (title, message) => addToast({ title, message, type: 'info' })
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Toast Notification Container */}
      <aside
        aria-label="Notifications"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-xl p-3.5 border shadow-xl backdrop-blur-md transition-all duration-300 animate-page-enter flex items-start justify-between gap-3 ${
              t.type === 'success'
                ? 'bg-slate-900/90 border-emerald-500/40 text-emerald-200'
                : t.type === 'warning'
                ? 'bg-slate-900/90 border-amber-500/40 text-amber-200'
                : t.type === 'error'
                ? 'bg-slate-900/90 border-rose-500/40 text-rose-200'
                : 'bg-slate-900/90 border-cyan-500/40 text-cyan-200'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="mt-0.5 shrink-0">
                {t.type === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                {t.type === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-400" />}
                {t.type === 'error' && <AlertCircle className="h-4 w-4 text-rose-400" />}
                {t.type === 'info' && <Info className="h-4 w-4 text-cyan-400" />}
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-white leading-tight">{t.title}</p>
                {t.message && <p className="text-[11px] text-slate-400 leading-normal">{t.message}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="text-slate-500 hover:text-slate-300 p-0.5 rounded transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </aside>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Return graceful no-op fallback if used outside provider
    return {
      success: () => {},
      warning: () => {},
      error: () => {},
      info: () => {}
    };
  }
  return context;
}

export default ToastProvider;
