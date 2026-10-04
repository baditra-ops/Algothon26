import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckSquare,
  Plus,
  Trash2,
  Clock,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Edit2,
  Calendar,
  X
} from 'lucide-react';
import { taskRepository } from '../db/repositories/taskRepository';
import { projectRepository } from '../db/repositories/projectRepository';
import conflictRepository from '../db/repositories/conflictRepository';
import ConflictResolutionModal from '../components/ConflictResolutionModal';
import { TASK_STATUS, TASK_PRIORITY } from '../db/schema';
import { MagneticButton } from '../components/MagneticButton';
import { Tooltip } from '../components/Tooltip';
import { SkeletonCard } from '../components/Skeleton';
import { useToast } from '../context/ToastContext';

export function TasksPage() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const initialProject = searchParams.get('project') || 'ALL';

  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProject);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  // Create form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [priority, setPriority] = useState(TASK_PRIORITY.MEDIUM);
  const [status, setStatus] = useState(TASK_STATUS.TODO);
  const [dueDate, setDueDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit form state
  const [editingTask, setEditingTask] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState(TASK_PRIORITY.MEDIUM);
  const [editStatus, setEditStatus] = useState(TASK_STATUS.TODO);
  const [editDueDate, setEditDueDate] = useState('');

  // Conflict modal state
  const [selectedConflict, setSelectedConflict] = useState(null);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);

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
        setProjectId(selectedProjectId !== 'ALL' ? selectedProjectId : projList[0].id);
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

    setIsSubmitting(true);
    try {
      await taskRepository.createTask({
        project_id: projectId,
        title,
        description,
        status,
        priority,
        due_date: dueDate || null
      });

      toast.success('Task Created', `"${title}" saved to local IndexedDB (PENDING_CREATE)`);
      setTitle('');
      setDescription('');
      setDueDate('');
      setShowCreateModal(false);
      await loadData();
    } catch (err) {
      toast.error('Error Creating Task', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditPriority(task.priority);
    setEditStatus(task.status);
    setEditDueDate(task.due_date ? task.due_date.split('T')[0] : '');
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editTitle.trim() || !editingTask) return;

    setIsSubmitting(true);
    try {
      await taskRepository.updateTask(editingTask.id, {
        title: editTitle,
        description: editDescription,
        priority: editPriority,
        status: editStatus,
        due_date: editDueDate || null
      });

      toast.success('Task Updated', `"${editTitle}" updated in local IndexedDB (PENDING_UPDATE)`);
      setEditingTask(null);
      await loadData();
    } catch (err) {
      toast.error('Error Updating Task', err.message);
    } finally {
      setIsSubmitting(false);
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
      toast.info('Status Updated', `Task moved to ${nextStatus}`);
      await loadData();
    } catch (err) {
      toast.error('Error Updating Status', err.message);
    }
  };

  const handleDelete = async (id, taskTitle) => {
    if (!window.confirm(`Delete task "${taskTitle || id}" locally?`)) return;
    try {
      await taskRepository.deleteTask(id);
      toast.info('Task Deleted', 'Removed from local active store and queued for deletion');
      await loadData();
    } catch (err) {
      toast.error('Error Deleting Task', err.message);
    }
  };

  const handleOpenConflict = async (taskId) => {
    try {
      const conflict = await conflictRepository.getPendingConflictByEntity('task', taskId);
      if (conflict) {
        setSelectedConflict(conflict);
        setIsConflictModalOpen(true);
      } else {
        toast.warning('Conflict Not Found', 'No pending conflict record found for this task in IndexedDB.');
      }
    } catch (err) {
      toast.error('Error Loading Conflict', err.message);
    }
  };

  // Filter tasks by status tab
  const displayedTasks = tasks.filter((t) => {
    if (statusFilter === 'ALL') return true;
    return t.status === statusFilter;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto py-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20 mb-2">
            <CheckSquare className="h-3 w-3" />
            <span>IndexedDB Field Checklists · Optimistic Versioning</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Tasks & Inspections</h1>
          <p className="text-sm text-slate-400 mt-1">
            Zero-latency field checklist items with automatic optimistic concurrency tracking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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

          <MagneticButton
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-lg shadow-teal-950/40 transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Add Task</span>
          </MagneticButton>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto text-xs font-medium">
        <button
          onClick={() => setStatusFilter('ALL')}
          className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
            statusFilter === 'ALL'
              ? 'bg-slate-900 text-teal-300 font-bold border border-teal-500/30 shadow-xs'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          All Tasks ({tasks.length})
        </button>
        <button
          onClick={() => setStatusFilter(TASK_STATUS.TODO)}
          className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
            statusFilter === TASK_STATUS.TODO
              ? 'bg-slate-900 text-teal-300 font-bold border border-teal-500/30 shadow-xs'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          To Do ({tasks.filter((t) => t.status === TASK_STATUS.TODO).length})
        </button>
        <button
          onClick={() => setStatusFilter(TASK_STATUS.IN_PROGRESS)}
          className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
            statusFilter === TASK_STATUS.IN_PROGRESS
              ? 'bg-slate-900 text-teal-300 font-bold border border-teal-500/30 shadow-xs'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          In Progress ({tasks.filter((t) => t.status === TASK_STATUS.IN_PROGRESS).length})
        </button>
        <button
          onClick={() => setStatusFilter(TASK_STATUS.COMPLETED)}
          className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
            statusFilter === TASK_STATUS.COMPLETED
              ? 'bg-slate-900 text-teal-300 font-bold border border-teal-500/30 shadow-xs'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          Completed ({tasks.filter((t) => t.status === TASK_STATUS.COMPLETED).length})
        </button>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl space-y-4 animate-modal-pop">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-teal-400" />
              <span>Create Local Task</span>
            </h3>
            <button
              onClick={() => setShowCreateModal(false)}
              className="text-xs text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="h-4 w-4" />
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
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white focus:outline-none focus:border-teal-500"
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
                <label className="block text-xs font-medium text-slate-300 mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white focus:outline-none focus:border-teal-500"
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
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Observation details, inspection steps, or equipment checklist..."
                rows={2}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white focus:outline-none focus:border-teal-500"
                >
                  <option value={TASK_STATUS.TODO}>TODO</option>
                  <option value={TASK_STATUS.IN_PROGRESS}>IN_PROGRESS</option>
                  <option value={TASK_STATUS.COMPLETED}>COMPLETED</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white focus:outline-none focus:border-teal-500"
                />
              </div>
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
      {editingTask && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl space-y-4 animate-modal-pop">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-teal-400" />
              <span>Edit Local Task</span>
            </h3>
            <button
              onClick={() => setEditingTask(null)}
              className="text-xs text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Task Title <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Description</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white focus:outline-none focus:border-teal-500"
                >
                  <option value={TASK_STATUS.TODO}>TODO</option>
                  <option value={TASK_STATUS.IN_PROGRESS}>IN_PROGRESS</option>
                  <option value={TASK_STATUS.COMPLETED}>COMPLETED</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Priority</label>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white focus:outline-none focus:border-teal-500"
                >
                  <option value={TASK_PRIORITY.LOW}>LOW</option>
                  <option value={TASK_PRIORITY.MEDIUM}>MEDIUM</option>
                  <option value={TASK_PRIORITY.HIGH}>HIGH</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Due Date</label>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingTask(null)}
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
                {isSubmitting ? 'Updating...' : 'Update Task'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Task List */}
      {loading ? (
        <div className="space-y-3">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      ) : displayedTasks.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-800/90 p-12 text-center space-y-4 bg-slate-950/40">
          <div className="inline-flex p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-500">
            <CheckSquare className="h-8 w-8 text-teal-400/60" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-white">No tasks in this view</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Add a checklist task to start recording field observations. Changes persist directly in local IndexedDB.
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-md transition-colors cursor-pointer"
            >
              Add First Task
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {displayedTasks.map((task) => {
            const project = projects.find((p) => p.id === task.project_id);
            const isCompleted = task.status === TASK_STATUS.COMPLETED;

            return (
              <div
                key={task.id}
                className={`rounded-2xl border bg-slate-900/40 p-4 sm:p-5 card-interactive flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  task.sync_status === 'CONFLICT'
                    ? 'border-amber-500/50 bg-amber-950/15'
                    : 'border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <Tooltip text={`Advance status (${task.status} → ${task.status === TASK_STATUS.TODO ? 'IN_PROGRESS' : task.status === TASK_STATUS.IN_PROGRESS ? 'COMPLETED' : 'TODO'})`}>
                    <button
                      onClick={() => handleToggleStatus(task)}
                      className="mt-0.5 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      ) : task.status === TASK_STATUS.IN_PROGRESS ? (
                        <Clock className="h-5 w-5 text-amber-400" />
                      ) : (
                        <Circle className="h-5 w-5 text-slate-500" />
                      )}
                    </button>
                  </Tooltip>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm font-semibold transition-all ${
                          isCompleted ? 'line-through text-slate-400' : 'text-white'
                        }`}
                      >
                        {task.title}
                      </span>
                      {project && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-950 text-slate-400 border border-slate-800">
                          {project.name}
                        </span>
                      )}
                      {task.due_date && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-950 text-slate-400 border border-slate-800 flex items-center gap-1 font-mono">
                          <Calendar className="h-3 w-3" />
                          <span>{new Date(task.due_date).toLocaleDateString()}</span>
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{task.description}</p>
                    )}
                  </div>
                </div>

                {/* Metadata & Actions */}
                <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-end sm:self-center">
                  {task.sync_status === 'CONFLICT' && (
                    <button
                      type="button"
                      onClick={() => handleOpenConflict(task.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold text-white bg-amber-500 hover:bg-amber-400 transition-colors shadow-md shadow-amber-500/20 cursor-pointer animate-pulse"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Resolve Conflict</span>
                    </button>
                  )}

                  <span
                    className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full font-mono ${
                      task.priority === TASK_PRIORITY.HIGH
                        ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                        : task.priority === TASK_PRIORITY.MEDIUM
                        ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-800/80 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {task.priority}
                  </span>

                  <span
                    className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-950 text-slate-400 border border-slate-800"
                    title="Concurrency version"
                  >
                    v{task.version} {task.version === 0 ? '(Local)' : '(Server)'}
                  </span>

                  <span
                    className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-semibold ${
                      task.sync_status === 'SYNCED'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : task.sync_status === 'PENDING_CREATE'
                        ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                        : task.sync_status === 'CONFLICT'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-teal-500/10 text-teal-300 border border-teal-500/30'
                    }`}
                  >
                    {task.sync_status === 'SYNCED'
                      ? '● Synced'
                      : task.sync_status === 'PENDING_CREATE'
                      ? '● Pending create'
                      : task.sync_status === 'CONFLICT'
                      ? '⚠ Conflict'
                      : '● Pending sync'}
                  </span>

                  <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
                    <Tooltip text="Edit task">
                      <button
                        onClick={() => handleStartEdit(task)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                    <Tooltip text="Delete task locally">
                      <button
                        onClick={() => handleDelete(task.id, task.title)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                  </div>
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
          toast.success('Conflict Resolved', `Resolved using strategy: ${strategy}`);
          loadData();
        }}
      />
    </div>
  );
}

export default TasksPage;
