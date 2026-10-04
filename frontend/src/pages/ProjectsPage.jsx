import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FolderKanban,
  Plus,
  Trash2,
  Sparkles,
  Edit2,
  ArrowRight,
  CheckSquare,
  Database,
  X
} from 'lucide-react';
import { projectRepository } from '../db/repositories/projectRepository';
import { getLocalDatabaseStats, seedDevelopmentData } from '../db/devTools';
import { MagneticButton } from '../components/MagneticButton';
import { Tooltip } from '../components/Tooltip';
import { SkeletonCard } from '../components/Skeleton';
import { useToast } from '../context/ToastContext';

export function ProjectsPage() {
  const toast = useToast();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  // Create form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit form state
  const [editingProject, setEditingProject] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

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

    setIsSubmitting(true);
    try {
      await projectRepository.createProject({ name, description });
      toast.success('Project Created', `"${name}" saved to local IndexedDB (PENDING_CREATE)`);
      setName('');
      setDescription('');
      setShowCreateModal(false);
      await loadProjects();
    } catch (err) {
      toast.error('Error Creating Project', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (proj) => {
    setEditingProject(proj);
    setEditName(proj.name);
    setEditDescription(proj.description || '');
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editName.trim() || !editingProject) return;

    setIsSubmitting(true);
    try {
      await projectRepository.updateProject(editingProject.id, {
        name: editName,
        description: editDescription
      });
      toast.success('Project Updated', `"${editName}" saved to local IndexedDB (PENDING_UPDATE)`);
      setEditingProject(null);
      await loadProjects();
    } catch (err) {
      toast.error('Error Updating Project', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id, projectName) => {
    if (!window.confirm(`Delete project "${projectName || id}" locally? Child tasks will also be removed/tombstoned.`)) return;
    try {
      await projectRepository.deleteProject(id);
      toast.info('Project Deleted', 'Removed from local active store and tombstoned for server sync');
      await loadProjects();
    } catch (err) {
      toast.error('Error Deleting Project', err.message);
    }
  };

  const handleSeed = async () => {
    await seedDevelopmentData();
    toast.success('Demo Data Seeded', 'Sample projects and checklist tasks loaded into IndexedDB');
    await loadProjects();
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto py-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20 mb-2">
            <Database className="h-3 w-3" />
            <span>IndexedDB Local Store · Dexie v3</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Projects Workspace</h1>
          <p className="text-sm text-slate-400 mt-1">
            Persisted locally with atomic outbox mutations. Operates with zero network latency.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Tooltip text="Seed test projects & tasks into local database">
            <button
              type="button"
              onClick={handleSeed}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span>Seed Demo Data</span>
            </button>
          </Tooltip>

          <MagneticButton
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-lg shadow-teal-950/40 transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>New Local Project</span>
          </MagneticButton>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl space-y-4 animate-modal-pop">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-teal-400" />
              <span>Create Local Field Project</span>
            </h3>
            <button
              onClick={() => setShowCreateModal(false)}
              className="text-xs text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="h-4 w-4" />
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
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
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
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 transition-colors cursor-pointer"
              >
                {isSubmitting ? 'Saving...' : 'Save to IndexedDB'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Modal */}
      {editingProject && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl space-y-4 animate-modal-pop">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-teal-400" />
              <span>Edit Local Project</span>
            </h3>
            <button
              onClick={() => setEditingProject(null)}
              className="text-xs text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Project Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Description / Site Notes
              </label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingProject(null)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 transition-colors cursor-pointer"
              >
                {isSubmitting ? 'Updating...' : 'Update Project'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Projects Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-800/90 p-12 text-center space-y-4 bg-slate-950/40">
          <div className="inline-flex p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-500">
            <FolderKanban className="h-8 w-8 text-teal-400/60" />
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
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-md transition-colors cursor-pointer"
            >
              Create Project
            </button>
            <button
              onClick={handleSeed}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
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
              className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 hover:border-slate-700 card-interactive flex flex-col justify-between space-y-4"
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

                  <div className="flex items-center gap-1">
                    <Tooltip text="Edit project notes">
                      <button
                        onClick={() => handleStartEdit(project)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                    <Tooltip text="Delete project locally">
                      <button
                        onClick={() => handleDelete(project.id, project.name)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                  </div>
                </div>

                <h3 className="text-base font-bold text-white tracking-tight">{project.name}</h3>
                <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                  {project.description || 'No site description logged.'}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <Link
                  to={`/tasks?project=${project.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-400 hover:text-teal-300 group transition-colors"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  <span>View Tasks</span>
                  <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                </Link>

                <span className="font-mono text-[10px] text-slate-500">
                  ID: {project.id.slice(0, 8)}...
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dev Tools Footer Drawer */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-teal-400" />
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
        </div>
      </div>
    </div>
  );
}

export default ProjectsPage;
