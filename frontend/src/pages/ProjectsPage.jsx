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
  X,
  Search,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { projectRepository } from '../db/repositories/projectRepository';
import { taskRepository } from '../db/repositories/taskRepository';
import { getLocalDatabaseStats, seedDevelopmentData } from '../db/devTools';
import { MagneticButton } from '../components/MagneticButton';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { Tooltip } from '../components/Tooltip';
import { SkeletonCard } from '../components/Skeleton';
import { useToast } from '../context/ToastContext';

export function ProjectsPage() {
  const toast = useToast();
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
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
      const [projData, taskData] = await Promise.all([
        projectRepository.getAllProjects(),
        taskRepository.getAllTasks()
      ]);
      setProjects(projData);
      setTasks(taskData);
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

  const filteredProjects = projects.filter((p) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(query) || (p.description && p.description.toLowerCase().includes(query));
  });

  const totalSyncedProjects = projects.filter((p) => p.sync_status === 'SYNCED').length;

  return (
    <div className="space-y-8 max-w-7xl mx-auto py-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20 mb-2 shadow-sm">
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
              className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors cursor-pointer shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span>Seed Demo Data</span>
            </button>
          </Tooltip>

          <MagneticButton
            onClick={() => setShowCreateModal(true)}
            className="btn-tactile inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-teal-400 hover:bg-teal-300 text-slate-950 shadow-lg shadow-teal-950/40 transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>New Local Project</span>
          </MagneticButton>
        </div>
      </div>

      {/* Metrics & Search Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl border border-slate-800/80 bg-slate-900/50 flex items-center justify-between shadow-sm card-interactive">
          <div className="space-y-0.5">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Workspaces</span>
            <div className="text-2xl font-extrabold text-white">
              <AnimatedCounter value={projects.length} />
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <FolderKanban className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-800/80 bg-slate-900/50 flex items-center justify-between shadow-sm card-interactive">
          <div className="space-y-0.5">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Inspections</span>
            <div className="text-2xl font-extrabold text-teal-300">
              <AnimatedCounter value={tasks.length} />
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckSquare className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-800/80 bg-slate-900/50 flex items-center justify-between shadow-sm card-interactive">
          <div className="space-y-0.5">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Synced to Cloud</span>
            <div className="text-2xl font-extrabold text-emerald-400">
              <AnimatedCounter value={totalSyncedProjects} />
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        {/* Search Input */}
        <div className="p-2 rounded-2xl border border-slate-800/80 bg-slate-900/50 flex items-center shadow-sm">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-9 pr-3 py-2 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>
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
      ) : filteredProjects.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-800/90 p-12 text-center space-y-4 bg-slate-950/40">
          <div className="inline-flex p-4 rounded-2xl bg-slate-900 border border-slate-800 text-slate-500 shadow-inner">
            <FolderKanban className="h-8 w-8 text-teal-400/60" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-white">
              {searchQuery ? 'No matching projects found' : 'No projects stored locally'}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery
                ? `No projects matched "${searchQuery}". Clear your search query to see all workspaces.`
                : 'Create your first field project offline or seed sample data. Records persist in your browser\'s IndexedDB.'}
            </p>
          </div>
          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-tactile px-4 py-2 rounded-xl text-xs font-semibold bg-teal-400 hover:bg-teal-300 text-slate-950 shadow-md transition-colors cursor-pointer"
            >
              Create Project
            </button>
            <button
              onClick={handleSeed}
              className="btn-tactile px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
            >
              Seed Demo Data
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((project) => {
            const projectTasks = tasks.filter((t) => t.project_id === project.id);
            const completedCount = projectTasks.filter((t) => t.status === 'COMPLETED').length;
            const progressPercent = projectTasks.length > 0 ? Math.round((completedCount / projectTasks.length) * 100) : 0;

            return (
              <div
                key={project.id}
                className="relative overflow-hidden rounded-3xl border border-slate-800/90 bg-gradient-to-b from-slate-900/60 to-slate-950/80 p-6 card-interactive flex flex-col justify-between space-y-5 shadow-lg group"
              >
                {/* Subtle top accent gradient line */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500/40 via-emerald-500/60 to-cyan-500/30 opacity-70 group-hover:opacity-100 transition-opacity" />

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2.5 rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/20 group-hover:scale-105 transition-transform">
                        <FolderKanban className="h-4 w-4" />
                      </div>
                      <span
                        className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-semibold ${
                          project.sync_status === 'SYNCED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : project.sync_status === 'PENDING_CREATE'
                            ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                            : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                        }`}
                      >
                        ● {project.sync_status}
                      </span>
                    </div>

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

                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight group-hover:text-teal-300 transition-colors">
                      {project.name}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mt-1">
                      {project.description || 'No site description logged.'}
                    </p>
                  </div>

                  {/* Task Progress Bar */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span>{projectTasks.length} checklist item{projectTasks.length !== 1 ? 's' : ''}</span>
                      <span className="text-teal-400 font-semibold">{progressPercent}% done</span>
                    </div>
                    <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <Link
                    to={`/tasks?project=${project.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-400 hover:text-teal-300 group/link transition-colors"
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    <span>View Checklist ({projectTasks.length})</span>
                    <ArrowRight className="h-3 w-3 group-link:translate-x-0.5 transition-transform" />
                  </Link>

                  <span className="font-mono text-[10px] text-slate-500">
                    ID: {project.id.slice(0, 8)}...
                  </span>
                </div>
              </div>
            );
          })}
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
