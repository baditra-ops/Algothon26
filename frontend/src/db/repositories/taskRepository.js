import db from '../database.js';
import { SYNC_STATUS, TASK_STATUS, TASK_PRIORITY, ENTITY_TYPE, MUTATION_OPERATION, MUTATION_STATUS } from '../schema.js';
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
   * Atomically records the task entity and an outbox CREATE mutation.
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

    if (syncStatus === SYNC_STATUS.PENDING_CREATE) {
      const mutation = {
        id: generateId(),
        entity_type: ENTITY_TYPE.TASK,
        entity_id: id,
        operation: MUTATION_OPERATION.CREATE,
        payload: {
          id,
          project_id: record.project_id,
          title: record.title,
          description: record.description,
          status: record.status,
          priority: record.priority,
          due_date: record.due_date
        },
        base_version: null, // Local-only task has no server version yet
        idempotency_key: generateId(),
        status: MUTATION_STATUS.PENDING,
        created_at: now,
        updated_at: now,
        attempt_count: 0,
        last_attempt_at: null,
        last_error: null
      };

      await db.transaction('rw', db.tasks, db.outbox, async () => {
        await db.tasks.add(record);
        await db.outbox.add(mutation);
      });
    } else {
      await db.tasks.add(record);
    }

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
   * Preserves created_at and last known server version.
   * Atomically updates entity and outbox mutation:
   * - If pending CREATE exists: coalesces payload into the pending CREATE mutation.
   * - If pending UPDATE exists: coalesces payload into existing pending UPDATE mutation, preserving base_version.
   * - Otherwise: enqueues a new UPDATE mutation with base_version = last known server version.
   */
  async updateTask(id, updates) {
    let resultRecord;

    await db.transaction('rw', db.tasks, db.outbox, async () => {
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

      // Check for existing pending outbox mutations to coalesce
      const pendingMutations = await db.outbox
        .where('[entity_type+entity_id]')
        .equals([ENTITY_TYPE.TASK, id])
        .filter((m) => m.status === MUTATION_STATUS.PENDING)
        .toArray();

      const pendingCreate = pendingMutations.find((m) => m.operation === MUTATION_OPERATION.CREATE);
      const pendingUpdate = pendingMutations.find((m) => m.operation === MUTATION_OPERATION.UPDATE);

      if (pendingCreate) {
        // Coalesce into existing pending CREATE mutation
        pendingCreate.payload = {
          ...pendingCreate.payload,
          project_id: updatedRecord.project_id,
          title: updatedRecord.title,
          description: updatedRecord.description,
          status: updatedRecord.status,
          priority: updatedRecord.priority,
          due_date: updatedRecord.due_date
        };
        pendingCreate.updated_at = now;
        await db.outbox.put(pendingCreate);
      } else if (pendingUpdate) {
        // Coalesce into existing pending UPDATE mutation
        // Strictly preserve original base_version, id, idempotency_key
        pendingUpdate.payload = {
          ...pendingUpdate.payload,
          project_id: updatedRecord.project_id,
          title: updatedRecord.title,
          description: updatedRecord.description,
          status: updatedRecord.status,
          priority: updatedRecord.priority,
          due_date: updatedRecord.due_date
        };
        pendingUpdate.updated_at = now;
        await db.outbox.put(pendingUpdate);
      } else {
        // Enqueue new UPDATE mutation with known server base_version
        const mutation = {
          id: generateId(),
          entity_type: ENTITY_TYPE.TASK,
          entity_id: id,
          operation: MUTATION_OPERATION.UPDATE,
          payload: {
            id,
            project_id: updatedRecord.project_id,
            title: updatedRecord.title,
            description: updatedRecord.description,
            status: updatedRecord.status,
            priority: updatedRecord.priority,
            due_date: updatedRecord.due_date
          },
          base_version: existing.version > 0 ? existing.version : null,
          idempotency_key: generateId(),
          status: MUTATION_STATUS.PENDING,
          created_at: now,
          updated_at: now,
          attempt_count: 0,
          last_attempt_at: null,
          last_error: null
        };
        await db.outbox.add(mutation);
      }

      await db.tasks.put(updatedRecord);
      resultRecord = updatedRecord;
    });

    return resultRecord;
  },

  /**
   * Delete a task.
   * - Local-only record (PENDING_CREATE or version === 0): Physically removes from Dexie and clears its pending outbox entries.
   * - Server-known record (SYNCED or PENDING_UPDATE): Marks sync_status = PENDING_DELETE,
   *   supersedes any pending UPDATE, and enqueues a DELETE mutation with base_version.
   */
  async deleteTask(id) {
    let deleted = false;

    await db.transaction('rw', db.tasks, db.outbox, async () => {
      const existing = await db.tasks.get(id);
      if (!existing) {
        deleted = false;
        return;
      }

      const isLocalOnly = existing.sync_status === SYNC_STATUS.PENDING_CREATE || existing.version === 0;
      const now = new Date().toISOString();

      if (isLocalOnly) {
        await db.tasks.delete(id);

        // Remove any pending/failed outbox mutations for this local-only task
        const mutations = await db.outbox
          .where('[entity_type+entity_id]')
          .equals([ENTITY_TYPE.TASK, id])
          .filter((m) => m.status !== MUTATION_STATUS.COMPLETED && m.status !== MUTATION_STATUS.PROCESSING)
          .toArray();

        if (mutations.length > 0) {
          await db.outbox.bulkDelete(mutations.map((m) => m.id));
        }

        deleted = true;
        return;
      }

      // Server-known record: mark as PENDING_DELETE tombstone
      await db.tasks.update(id, {
        sync_status: SYNC_STATUS.PENDING_DELETE,
        updated_at: now
      });

      // Supersede any pending UPDATE mutation for this task
      const pendingUpdates = await db.outbox
        .where('[entity_type+entity_id]')
        .equals([ENTITY_TYPE.TASK, id])
        .filter((m) => m.status === MUTATION_STATUS.PENDING)
        .toArray();

      if (pendingUpdates.length > 0) {
        await db.outbox.bulkDelete(pendingUpdates.map((m) => m.id));
      }

      // Enqueue DELETE mutation with base_version
      await db.outbox.add({
        id: generateId(),
        entity_type: ENTITY_TYPE.TASK,
        entity_id: id,
        operation: MUTATION_OPERATION.DELETE,
        payload: { id },
        base_version: existing.version,
        idempotency_key: generateId(),
        status: MUTATION_STATUS.PENDING,
        created_at: now,
        updated_at: now,
        attempt_count: 0,
        last_attempt_at: null,
        last_error: null
      });

      deleted = true;
    });

    return deleted;
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

