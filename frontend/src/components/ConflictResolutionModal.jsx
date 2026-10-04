import React, { useState } from 'react';
import {
  AlertTriangle,
  GitMerge,
  Server,
  Smartphone,
  X,
  ShieldAlert
} from 'lucide-react';
import { conflictService, calculateFieldDiffs } from '../sync/index.js';
import { TASK_STATUS, TASK_PRIORITY } from '../db/schema.js';

function ConflictResolutionModalDialog({ conflict, onClose, onResolved }) {
  const [mode, setMode] = useState('CHOICE'); // 'CHOICE' | 'MERGE' | 'CONFIRM_SERVER'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const local = conflict.local_snapshot || {};
  const server = conflict.server_snapshot || {};

  // Compute field diffs
  const diffs = calculateFieldDiffs(local, server);
  const differingCount = diffs.filter((d) => d.isDifferent).length;

  // Merge form state (initialized with local snapshot values)
  const [mergedForm, setMergedForm] = useState({
    title: local.title || server.title || '',
    description: local.description !== undefined ? local.description : server.description || '',
    status: local.status || server.status || TASK_STATUS.TODO,
    priority: local.priority || server.priority || TASK_PRIORITY.MEDIUM,
    due_date: local.due_date || server.due_date || ''
  });

  const handleKeepLocal = async () => {
    setLoading(true);
    setError(null);
    try {
      await conflictService.keepLocal(conflict.id);
      onResolved?.('KEEP_LOCAL');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeepServer = async () => {
    setLoading(true);
    setError(null);
    try {
      await conflictService.keepServer(conflict.id);
      onResolved?.('KEEP_SERVER');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmMerge = async (e) => {
    e.preventDefault();
    if (!mergedForm.title.trim()) {
      setError('Task title is required.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await conflictService.merge(conflict.id, mergedForm);
      onResolved?.('MERGED');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const pickField = (key, value) => {
    setMergedForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl border border-amber-500/40 bg-slate-900 shadow-2xl p-6 sm:p-8 space-y-6 max-h-[92vh] flex flex-col my-auto">
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Resolve Version Conflict</h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  HTTP 409
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Task was modified concurrently. Compare your offline changes with the server and choose a resolution.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
            {error}
          </div>
        )}

        {/* Versions Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Smartphone className="h-4 w-4 text-cyan-400" />
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Your Offline Base</span>
                <span className="text-sm font-bold text-white font-mono">
                  Base Version: v{conflict.base_version ?? 0}
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              Local Changes
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Server className="h-4 w-4 text-emerald-400" />
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Current Cloud State</span>
                <span className="text-sm font-bold text-white font-mono">
                  Server Version: v{conflict.server_version ?? server.version ?? 1}
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              Authoritative
            </span>
          </div>
        </div>

        {/* MODE: CHOICE (Side-by-side comparison) */}
        {mode === 'CHOICE' && (
          <div className="space-y-4 overflow-y-auto pr-1 flex-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                Comparing fields: <strong className="text-white">{differingCount} difference(s) detected</strong>
              </span>
              <span className="text-slate-500">Offline-safe resolution</span>
            </div>

            <div className="rounded-xl border border-slate-800 overflow-hidden divide-y divide-slate-800 bg-slate-950/40">
              {diffs.map((d) => (
                <div
                  key={d.key}
                  className={`p-3.5 transition-colors ${
                    d.isDifferent ? 'bg-amber-950/10' : 'bg-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      {d.label}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        d.isDifferent
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {d.isDifferent ? 'DIFFERENCE' : 'IDENTICAL'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                      <span className="text-[10px] text-cyan-400 font-semibold block uppercase">
                        Your Offline Version
                      </span>
                      <div className="text-white font-medium break-words">
                        {String(d.localValue) || <em className="text-slate-500">empty</em>}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                      <span className="text-[10px] text-emerald-400 font-semibold block uppercase">
                        Server Version
                      </span>
                      <div className="text-white font-medium break-words">
                        {String(d.serverValue) || <em className="text-slate-500">empty</em>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Resolution Action Buttons */}
            <div className="pt-2 border-t border-slate-800 space-y-3">
              <span className="text-xs font-semibold text-slate-300 block">Choose Resolution Strategy:</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Keep Local */}
                <button
                  type="button"
                  onClick={handleKeepLocal}
                  disabled={loading}
                  className="p-3.5 rounded-xl border border-cyan-500/30 bg-cyan-950/20 hover:bg-cyan-900/30 text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs mb-1">
                    <Smartphone className="h-4 w-4" />
                    <span>Keep Local Changes</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Re-applies your offline edits using the server version (v{conflict.server_version}) as the new concurrency base.
                  </p>
                </button>

                {/* Keep Server */}
                <button
                  type="button"
                  onClick={() => setMode('CONFIRM_SERVER')}
                  disabled={loading}
                  className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 hover:bg-emerald-900/30 text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs mb-1">
                    <Server className="h-4 w-4" />
                    <span>Keep Server Version</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Discards your local offline changes and accepts the cloud server's latest version.
                  </p>
                </button>

                {/* Merge / Edit */}
                <button
                  type="button"
                  onClick={() => setMode('MERGE')}
                  disabled={loading}
                  className="p-3.5 rounded-xl border border-purple-500/30 bg-purple-950/20 hover:bg-purple-900/30 text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-purple-300 font-bold text-xs mb-1">
                    <GitMerge className="h-4 w-4" />
                    <span>Merge / Custom Edit</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Manually select and edit fields individually to create a custom combined task.
                  </p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODE: CONFIRM_SERVER (Destructive Action Confirmation) */}
        {mode === 'CONFIRM_SERVER' && (
          <div className="p-6 rounded-xl border border-rose-500/30 bg-rose-950/20 space-y-4 my-auto">
            <div className="flex items-center gap-3 text-rose-400">
              <ShieldAlert className="h-6 w-6" />
              <h3 className="text-base font-bold text-white">Discard Local Changes Confirmation</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to discard your offline changes for <strong className="text-white">"{local.title || 'this task'}"</strong>?
              Your local edits will be replaced with the server version, and the conflicting mutation will be safely removed. This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMode('CHOICE')}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleKeepServer}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition-colors cursor-pointer"
              >
                {loading ? 'Applying Server Version...' : 'Yes, Keep Server & Discard Local'}
              </button>
            </div>
          </div>
        )}

        {/* MODE: MERGE / EDIT */}
        {mode === 'MERGE' && (
          <form onSubmit={handleConfirmMerge} className="space-y-4 overflow-y-auto pr-1 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                <GitMerge className="h-4 w-4" />
                <span>Custom Merge Mode — Pick or Edit Each Field</span>
              </span>
              <button
                type="button"
                onClick={() => setMode('CHOICE')}
                className="text-xs text-slate-400 hover:text-white"
              >
                Cancel Merge
              </button>
            </div>

            {/* Field: Title */}
            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">Task Title *</label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => pickField('title', local.title)}
                    className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 hover:bg-cyan-900"
                  >
                    Use Local
                  </button>
                  <button
                    type="button"
                    onClick={() => pickField('title', server.title)}
                    className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900"
                  >
                    Use Server
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={mergedForm.title}
                onChange={(e) => setMergedForm({ ...mergedForm, title: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-purple-500"
                required
              />
            </div>

            {/* Field: Description */}
            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">Description</label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => pickField('description', local.description)}
                    className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 hover:bg-cyan-900"
                  >
                    Use Local
                  </button>
                  <button
                    type="button"
                    onClick={() => pickField('description', server.description)}
                    className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900"
                  >
                    Use Server
                  </button>
                </div>
              </div>
              <textarea
                value={mergedForm.description}
                onChange={(e) => setMergedForm({ ...mergedForm, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Field: Status & Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-950 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300">Status</label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => pickField('status', local.status)}
                      className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800"
                    >
                      Local: {local.status}
                    </button>
                    <button
                      type="button"
                      onClick={() => pickField('status', server.status)}
                      className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800"
                    >
                      Server: {server.status}
                    </button>
                  </div>
                </div>
                <select
                  value={mergedForm.status}
                  onChange={(e) => setMergedForm({ ...mergedForm, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value={TASK_STATUS.TODO}>TODO</option>
                  <option value={TASK_STATUS.IN_PROGRESS}>IN_PROGRESS</option>
                  <option value={TASK_STATUS.COMPLETED}>COMPLETED</option>
                </select>
              </div>

              <div className="p-3 rounded-xl border border-slate-800 bg-slate-950 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300">Priority</label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => pickField('priority', local.priority)}
                      className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800"
                    >
                      Local: {local.priority}
                    </button>
                    <button
                      type="button"
                      onClick={() => pickField('priority', server.priority)}
                      className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800"
                    >
                      Server: {server.priority}
                    </button>
                  </div>
                </div>
                <select
                  value={mergedForm.priority}
                  onChange={(e) => setMergedForm({ ...mergedForm, priority: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value={TASK_PRIORITY.LOW}>LOW</option>
                  <option value={TASK_PRIORITY.MEDIUM}>MEDIUM</option>
                  <option value={TASK_PRIORITY.HIGH}>HIGH</option>
                </select>
              </div>
            </div>

            {/* Field: Due Date */}
            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">Due Date</label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => pickField('due_date', local.due_date)}
                    className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800"
                  >
                    Use Local
                  </button>
                  <button
                    type="button"
                    onClick={() => pickField('due_date', server.due_date)}
                    className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800"
                  >
                    Use Server
                  </button>
                </div>
              </div>
              <input
                type="date"
                value={mergedForm.due_date ? mergedForm.due_date.split('T')[0] : ''}
                onChange={(e) => setMergedForm({ ...mergedForm, due_date: e.target.value || null })}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Merge Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setMode('CHOICE')}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Back to Comparison
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 transition-colors shadow-lg shadow-purple-600/20 cursor-pointer"
              >
                {loading ? 'Saving Merged Task...' : 'Confirm & Save Merged Task'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function ConflictResolutionModal({ conflict, isOpen, onClose, onResolved }) {
  if (!isOpen || !conflict) return null;
  return (
    <ConflictResolutionModalDialog
      conflict={conflict}
      onClose={onClose}
      onResolved={onResolved}
    />
  );
}

export default ConflictResolutionModal;

