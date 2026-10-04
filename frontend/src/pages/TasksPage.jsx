import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Plus,
  Trash2,
  Clock,
  AlertCircle,
  FolderKanban,
  CheckCircle2,
  Circle,
  Database,
  ArrowUpDown,
  AlertTriangle
} from 'lucide-react';
import { taskRepository } from '../db/repositories/taskRepository';
import { projectRepository } from '../db/repositories/projectRepository';
import conflictRepository from '../db/repositories/conflictRepository';
import ConflictResolutionModal from '../components/ConflictResolutionModal';
import { TASK_STATUS, TASK_PRIORITY } from '../db/schema';

export function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionNotice, setActionNotice] = useState('');
  const [selectedConflict, setSelectedConflict] = useState(null);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [priority, setPriority] = useState(TASK_PRIORITY.MEDIUM);
  const [status, setStatus] = useState(TASK_STATUS.TODO);

  const loadData = async () => {
    setLoading(true);
    try {
      const projList = await projectRepository.getAllProjects();
      setProjects(projList);

      let taskList;
      if (selectedProjectId === 'ALL') {
        taskList = await taskRepository.getAllTasks();
      } else {
        taskList = await taskRepository.getTasksByProjectId(selectedProjectId);
      }
      setTasks(taskList);

      if (projList.length > 0 && !projectId) {
        setProjectId(projList[0].id);
      }
    } catch (err) {
      console.error('[TasksPage] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedProjectId]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim() || !projectId) return;

    try {
      await taskRepository.createTask({
        project_id: projectId,
        title,
        description,
        status,
        priority
      });

      setTitle('');
      setDescription('');
      setShowCreateModal(false);
      setActionNotice('Task saved to IndexedDB (version = 0, PENDING_CREATE)');
      setTimeout(() => setActionNotice(''), 3000);
      await loadData();
    } catch (err) {
      alert(`Error creating task: ${err.message}`);
    }
  };

  const handleToggleStatus = async (task) => {
    const nextStatus =
      task.status === TASK_STATUS.TODO
        ? TASK_STATUS.IN_PROGRESS
        : task.status === TASK_STATUS.IN_PROGRESS
        ? TASK_STATUS.COMPLETED
        : TASK_STATUS.TODO;

    try {
      await taskRepository.updateTask(task.id, { status: nextStatus });
      setActionNotice(`Status updated to ${nextStatus} in IndexedDB`);
      setTimeout(() => setActionNotice(''), 3000);
      await loadData();
    } catch (err) {
      alert(`Error updating task: ${err.message}`);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this task locally?')) return;
    try {
      await taskRepository.deleteTask(id);
      setActionNotice('Task removed from active local store');
      setTimeout(() => setActionNotice(''), 3000);
      await loadData();
    } catch (err) {
      alert(`Error deleting task: ${err.message}`);
    }
  };

  const handleOpenConflict = async (taskId) => {
    try {
      const conflict = await conflictRepository.getPendingConflictByEntity('task', taskId);
      if (conflict) {
        setSelectedConflict(conflict);
        setIsConflictModalOpen(true);
      } else {
        alert('No active conflict record found for this task in IndexedDB.');
      }
    } catch (err) {
      alert(`Error loading conflict: ${err.message}`);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto py-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20 mb-2">
            <CheckSquare className="h-3 w-3" />
            <span>IndexedDB Field Checklists</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Tasks & Inspections</h1>
          <p className="text-sm text-slate-400 mt-1">
            Zero-latency local task management with optimistic versioning metadata.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Project Filter */}
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-teal-500 cursor-pointer"
          >
            <option value="ALL">All Projects ({projects.length})</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              if (projects.length === 0) {
                alert('Please create or seed at least one project first.');
                return;
              }
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-950/40 transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>New Local Task</span>
          </button>
        </div>
      </div>

      {/* Action Notice */}
      {actionNotice && (
        <div className="rounded-xl border border-teal-500/30 bg-teal-950/40 px-4 py-2.5 text-xs text-teal-300 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-teal-400 animate-pulse"></span>
            {actionNotice}
          </span>
          <span className="text-[11px] text-slate-400">IndexedDB: tasks store</span>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-teal-400" />
              <span>Create Local Task</span>
            </h3>
            <button
              onClick={() => setShowCreateModal(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Target Project <span className="text-rose-400">*</span>
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-teal-500"
                  required
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-teal-500"
                >
                  <option value={TASK_PRIORITY.LOW}>LOW</option>
                  <option value={TASK_PRIORITY.MEDIUM}>MEDIUM</option>
                  <option value={TASK_PRIORITY.HIGH}>HIGH</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Task Title <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Inspect hydraulic pressure levels on Valve 4"
                className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Task Description / Field Checklist
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Diagnostic steps, inspection criteria, serial numbers..."
                rows={2}
                className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
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
                className="px-5 py-2 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white transition-colors"
              >
                Save to IndexedDB
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Task List */}
      {loading ? (
        <div className="text-center py-12 text-sm text-slate-400">Loading local IndexedDB tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center space-y-4">
          <div className="inline-flex p-3 rounded-2xl bg-slate-900 text-slate-500">
            <CheckSquare className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-white">No tasks in local store</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Create field checklist tasks or switch projects. All tasks persist on your device with offline version tracking.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const project = projects.find((p) => p.id === task.project_id);

            return (
              <div
                key={task.id}
                className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 flex-1">
                  {/* Status Toggle Button */}
                  <button
                    onClick={() => handleToggleStatus(task)}
                    className="mt-0.5 p-1 rounded-md text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title={`Click to advance status (${task.status})`}
                  >
                    {task.status === TASK_STATUS.COMPLETED ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : task.status === TASK_STATUS.IN_PROGRESS ? (
                      <Clock className="h-5 w-5 text-amber-400" />
                    ) : (
                      <Circle className="h-5 w-5 text-slate-500" />
                    )}
                  </button>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">{task.title}</span>
                      {project && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          {project.name}
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-xs text-slate-400 leading-relaxed">{task.description}</p>
                    )}
                  </div>
                </div>

                {/* Metadata & Actions */}
                <div className="flex flex-wrap items-center gap-3 shrink-0 self-end sm:self-center">
                  {task.sync_status === 'CONFLICT' && (
                    <button
                      type="button"
                      onClick={() => handleOpenConflict(task.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-white bg-amber-500 hover:bg-amber-400 transition-colors shadow-md shadow-amber-500/20 cursor-pointer"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Resolve Conflict</span>
                    </button>
                  )}

                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded font-mono ${
                      task.priority === TASK_PRIORITY.HIGH
                        ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                        : task.priority === TASK_PRIORITY.MEDIUM
                        ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {task.priority}
                  </span>

                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800" title="Version metadata for concurrency">
                    v{task.version} {task.version === 0 ? '(Local)' : '(Server)'}
                  </span>

                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                      task.sync_status === 'SYNCED'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : task.sync_status === 'PENDING_CREATE'
                        ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                        : task.sync_status === 'CONFLICT'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                    }`}
                  >
                    ● {task.sync_status}
                  </span>

                  <button
                    onClick={() => handleDelete(task.id)}
                    className="p-1 rounded-md text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                    title="Delete local task"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Conflict Resolution Modal */}
      <ConflictResolutionModal
        conflict={selectedConflict}
        isOpen={isConflictModalOpen}
        onClose={() => {
          setIsConflictModalOpen(false);
          setSelectedConflict(null);
        }}
        onResolved={(strategy) => {
          setActionNotice(`Conflict resolved using ${strategy}.`);
          setTimeout(() => setActionNotice(''), 3000);
          loadData();
        }}
      />
    </div>
  );
}
