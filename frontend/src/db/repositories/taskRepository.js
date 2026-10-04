import db from '../database.js';
import { SYNC_STATUS, TASK_STATUS, TASK_PRIORITY } from '../schema.js';
import { validateTask } from '../validation.js';

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const taskRepository = {
  /**
   * Create a new task locally in IndexedDB.
   * Locally created tasks are initialized with version = 0.
   */
  async createTask(taskData) {
    validateTask(taskData);

    const now = new Date().toISOString();
    const id = taskData.id || generateId();

    // Local-only tasks start at version 0 until central server assigns version 1
    const version = taskData.version !== undefined ? taskData.version : 0;
    const syncStatus = taskData.sync_status || SYNC_STATUS.PENDING_CREATE;

    const record = {
      id,
      project_id: taskData.project_id,
      title: taskData.title.trim(),
      description: taskData.description ? taskData.description.trim() : '',
      status: taskData.status || TASK_STATUS.TODO,
      priority: taskData.priority || TASK_PRIORITY.MEDIUM,
      due_date: taskData.due_date || null,
      created_at: taskData.created_at || now,
      updated_at: taskData.updated_at || now,
      version,
      sync_status: syncStatus,
      last_synced_at: taskData.last_synced_at || null
    };

    await db.tasks.add(record);
    return record;
  },

  /**
   * Retrieve a task by its UUID.
   */
  async getTaskById(id, { includeDeleted = false } = {}) {
    const record = await db.tasks.get(id);
    if (!record) return null;

    if (!includeDeleted && record.sync_status === SYNC_STATUS.PENDING_DELETE) {
      return null;
    }
    return record;
  },

  /**
   * Retrieve all tasks.
   */
  async getAllTasks({ includeDeleted = false } = {}) {
    let collection = db.tasks.orderBy('updated_at').reverse();

    if (!includeDeleted) {
      collection = collection.filter((t) => t.sync_status !== SYNC_STATUS.PENDING_DELETE);
    }

    return await collection.toArray();
  },

  /**
   * Retrieve tasks belonging to a specific project.
   */
  async getTasksByProjectId(projectId, { includeDeleted = false } = {}) {
    let collection = db.tasks.where('project_id').equals(projectId);

    if (!includeDeleted) {
      collection = collection.filter((t) => t.sync_status !== SYNC_STATUS.PENDING_DELETE);
    }

    const tasks = await collection.toArray();
    // Sort in-memory by updated_at descending
    return tasks.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  },

  /**
   * Update an existing task in IndexedDB.
   * Preserves created_at.
   * Does NOT increment server version locally! (Version represents last known server version).
   * Transitions sync_status from SYNCED to PENDING_UPDATE.
   */
  async updateTask(id, updates) {
    const existing = await db.tasks.get(id);
    if (!existing) {
      throw new Error(`Task with ID ${id} not found.`);
    }

    validateTask({ ...existing, ...updates });

    const now = new Date().toISOString();
    let nextSyncStatus = existing.sync_status;

    if (existing.sync_status === SYNC_STATUS.SYNCED) {
      nextSyncStatus = SYNC_STATUS.PENDING_UPDATE;
    }

    const updatedRecord = {
      ...existing,
      ...updates,
      id, // Immutable ID
      project_id: updates.project_id || existing.project_id,
      created_at: existing.created_at, // Preserve creation timestamp
      updated_at: now,
      version: existing.version, // Preserve known server version (do NOT increment locally)
      sync_status: nextSyncStatus
    };

    await db.tasks.put(updatedRecord);
    return updatedRecord;
  },

  /**
   * Delete a task.
   * - Local-only record (PENDING_CREATE or version === 0): Physically remove from Dexie.
   * - Server-known record (SYNCED or PENDING_UPDATE): Mark sync_status = PENDING_DELETE.
   */
  async deleteTask(id) {
    const existing = await db.tasks.get(id);
    if (!existing) {
      return false;
    }

    const isLocalOnly = existing.sync_status === SYNC_STATUS.PENDING_CREATE || existing.version === 0;

    if (isLocalOnly) {
      await db.tasks.delete(id);
      return true;
    }

    // Mark as PENDING_DELETE for future sync engine
    const now = new Date().toISOString();
    await db.tasks.update(id, {
      sync_status: SYNC_STATUS.PENDING_DELETE,
      updated_at: now
    });
    return true;
  },

  /**
   * Helper to bulk cache server tasks into local IndexedDB with SYNCED status.
   */
  async upsertSyncedTasks(tasks) {
    const now = new Date().toISOString();
    const records = tasks.map((t) => ({
      id: t.id,
      project_id: t.project_id,
      title: t.title,
      description: t.description || '',
      status: t.status,
      priority: t.priority,
      due_date: t.due_date,
      created_at: t.created_at,
      updated_at: t.updated_at,
      version: t.version, // Preserve server version
      sync_status: SYNC_STATUS.SYNCED,
      last_synced_at: now
    }));

    await db.tasks.bulkPut(records);
    return records;
  },

  /**
   * Clear all tasks from local store.
   */
  async clearTasks() {
    await db.tasks.clear();
  }
};

export default taskRepository;
