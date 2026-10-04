import React, { useState, useEffect } from 'react';
import {
  FolderKanban,
  Plus,
  Trash2,
  Calendar,
  Layers,
  Database,
  RefreshCw,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { projectRepository } from '../db/repositories/projectRepository';
import { getLocalDatabaseStats, clearLocalDatabase, seedDevelopmentData } from '../db/devTools';

export function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [stats, setStats] = useState(null);
  const [actionNotice, setActionNotice] = useState('');

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await projectRepository.getAllProjects();
      setProjects(data);
      const s = await getLocalDatabaseStats();
      setStats(s);
    } catch (err) {
      console.error('[ProjectsPage] Failed to load local projects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      await projectRepository.createProject({ name, description });
      setName('');
      setDescription('');
      setShowCreateModal(false);
      setActionNotice('Project saved to IndexedDB (Client Store)');
      setTimeout(() => setActionNotice(''), 3000);
      await loadProjects();
    } catch (err) {
      alert(`Error creating project: ${err.message}`);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this project locally?')) return;
    try {
      await projectRepository.deleteProject(id);
      setActionNotice('Project deleted from active local store');
      setTimeout(() => setActionNotice(''), 3000);
      await loadProjects();
    } catch (err) {
      alert(`Error deleting project: ${err.message}`);
    }
  };

  const handleSeed = async () => {
    await seedDevelopmentData();
    setActionNotice('Sample field projects seeded into IndexedDB');
    setTimeout(() => setActionNotice(''), 3000);
    await loadProjects();
  };

  const handleClear = async () => {
    if (!window.confirm('Clear all local IndexedDB records? This cannot be undone.')) return;
    await clearLocalDatabase();
    setActionNotice('Local IndexedDB cleared');
    setTimeout(() => setActionNotice(''), 3000);
    await loadProjects();
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto py-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
            <Database className="h-3 w-3" />
            <span>IndexedDB Local Store · Dexie.js</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Projects Workspace</h1>
          <p className="text-sm text-slate-400 mt-1">
            Locally persisted project containers for frontline inspection sites and field operations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSeed}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
            title="Seed sample data into IndexedDB"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>Seed Demo Data</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>New Local Project</span>
          </button>
        </div>
      </div>

      {/* Action Notice Banner */}
      {actionNotice && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-4 py-2.5 text-xs text-emerald-300 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            {actionNotice}
          </span>
          <span className="text-[11px] text-slate-400">IndexedDB: fieldnote_db</span>
        </div>
      )}

      {/* Modal / Quick Create Box */}
      {showCreateModal && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-emerald-400" />
              <span>Create Local Field Project</span>
            </h3>
            <button
              onClick={() => setShowCreateModal(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Project Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Substation Alpha Grid Audit"
                className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Description / Site Notes
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief scope of works, site location, and field notes..."
                rows={2}
                className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Dismiss
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                Save to IndexedDB
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Projects Grid */}
      {loading ? (
        <div className="text-center py-12 text-sm text-slate-400">Loading local IndexedDB projects...</div>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center space-y-4">
          <div className="inline-flex p-3 rounded-2xl bg-slate-900 text-slate-500">
            <FolderKanban className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-white">No projects stored locally</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Create your first field project offline or seed sample data. Records persist in your browser's IndexedDB and survive reloads.
            </p>
          </div>
          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Create Project
            </button>
            <button
              onClick={handleSeed}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200"
            >
              Seed Demo Data
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((project) => (
            <div
              key={project.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold ${
                      project.sync_status === 'SYNCED'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : project.sync_status === 'PENDING_CREATE'
                        ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                        : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                    }`}
                  >
                    ● {project.sync_status}
                  </span>

                  <button
                    onClick={() => handleDelete(project.id)}
                    className="p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                    title="Delete local project"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <h3 className="text-base font-bold text-white tracking-tight">{project.name}</h3>
                <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                  {project.description || 'No site description logged.'}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
                <span className="font-mono text-[10px]">ID: {project.id.slice(0, 8)}...</span>
                <span>{new Date(project.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dev Tools Footer Drawer */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-emerald-400" />
          <span>
            IndexedDB: <strong>{stats?.totalProjects || 0}</strong> projects, <strong>{stats?.totalTasks || 0}</strong> tasks on device
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadProjects}
            className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
          >
            Refresh
          </button>
          <span>·</span>
          <button
            onClick={handleClear}
            className="text-xs text-rose-400 hover:text-rose-300 underline cursor-pointer"
          >
            Clear Local Database
          </button>
        </div>
      </div>
    </div>
  );
}
