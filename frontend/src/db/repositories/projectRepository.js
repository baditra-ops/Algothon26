import db from '../database.js';
import { SYNC_STATUS, ENTITY_TYPE, MUTATION_OPERATION, MUTATION_STATUS } from '../schema.js';
import { validateProject } from '../validation.js';

/**
 * Generate a client UUIDv4 using native browser crypto or fallback.
 */
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

export const projectRepository = {
  /**
   * Create a new project locally in IndexedDB.
   * Atomically records the project entity and an outbox CREATE mutation.
   */
  async createProject(projectData) {
    validateProject(projectData);

    const now = new Date().toISOString();
    const id = projectData.id || generateId();
    const syncStatus = projectData.sync_status || SYNC_STATUS.PENDING_CREATE;

    const record = {
      id,
      name: projectData.name.trim(),
      description: projectData.description ? projectData.description.trim() : '',
      created_at: projectData.created_at || now,
      updated_at: projectData.updated_at || now,
      sync_status: syncStatus,
      last_synced_at: projectData.last_synced_at || null
    };

    // If local operation (PENDING_CREATE), atomically write entity and outbox mutation
    if (syncStatus === SYNC_STATUS.PENDING_CREATE) {
      const mutation = {
        id: generateId(),
        entity_type: ENTITY_TYPE.PROJECT,
        entity_id: id,
        operation: MUTATION_OPERATION.CREATE,
        payload: {
          id,
          name: record.name,
          description: record.description
        },
        base_version: null,
        idempotency_key: generateId(),
        status: MUTATION_STATUS.PENDING,
        created_at: now,
        updated_at: now,
        attempt_count: 0,
        last_attempt_at: null,
        last_error: null
      };

      await db.transaction('rw', db.projects, db.outbox, async () => {
        await db.projects.add(record);
        await db.outbox.add(mutation);
      });
    } else {
      await db.projects.add(record);
    }

    return record;
  },

  /**
   * Retrieve a project by its UUID.
   * By default excludes records marked for deletion unless includeDeleted is true.
   */
  async getProjectById(id, { includeDeleted = false } = {}) {
    const record = await db.projects.get(id);
    if (!record) return null;

    if (!includeDeleted && record.sync_status === SYNC_STATUS.PENDING_DELETE) {
      return null;
    }
    return record;
  },

  /**
   * Retrieve all projects, sorted by updated_at descending.
   */
  async getAllProjects({ includeDeleted = false } = {}) {
    let collection = db.projects.orderBy('updated_at').reverse();

    if (!includeDeleted) {
      collection = collection.filter((p) => p.sync_status !== SYNC_STATUS.PENDING_DELETE);
    }

    return await collection.toArray();
  },

  /**
   * Update an existing project in IndexedDB.
   * Atomically updates entity and outbox mutation:
   * - If pending CREATE exists: coalesces payload into the pending CREATE mutation.
   * - If pending UPDATE exists: coalesces payload into the existing pending UPDATE mutation.
   * - Otherwise: enqueues a new UPDATE mutation.
   */
  async updateProject(id, updates) {
    let resultRecord;

    await db.transaction('rw', db.projects, db.outbox, async () => {
      const existing = await db.projects.get(id);
      if (!existing) {
        throw new Error(`Project with ID ${id} not found.`);
      }

      if (updates.name !== undefined) {
        validateProject({ ...existing, ...updates });
      }

      const now = new Date().toISOString();
      let nextSyncStatus = existing.sync_status;

      if (existing.sync_status === SYNC_STATUS.SYNCED) {
        nextSyncStatus = SYNC_STATUS.PENDING_UPDATE;
      }

      const updatedRecord = {
        ...existing,
        ...updates,
        id, // Immutable ID
        created_at: existing.created_at, // Preserve creation timestamp
        updated_at: now,
        sync_status: nextSyncStatus
      };

      // Check for existing pending outbox mutations to coalesce
      const pendingMutations = await db.outbox
        .where('[entity_type+entity_id]')
        .equals([ENTITY_TYPE.PROJECT, id])
        .filter((m) => m.status === MUTATION_STATUS.PENDING)
        .toArray();

      const pendingCreate = pendingMutations.find((m) => m.operation === MUTATION_OPERATION.CREATE);
      const pendingUpdate = pendingMutations.find((m) => m.operation === MUTATION_OPERATION.UPDATE);

      if (pendingCreate) {
        // Coalesce into existing pending CREATE mutation
        pendingCreate.payload = {
          ...pendingCreate.payload,
          name: updatedRecord.name,
          description: updatedRecord.description
        };
        pendingCreate.updated_at = now;
        await db.outbox.put(pendingCreate);
      } else if (pendingUpdate) {
        // Coalesce into existing pending UPDATE mutation, preserving base_version, id, idempotency_key
        pendingUpdate.payload = {
          ...pendingUpdate.payload,
          name: updatedRecord.name,
          description: updatedRecord.description
        };
        pendingUpdate.updated_at = now;
        await db.outbox.put(pendingUpdate);
      } else {
        // Enqueue new UPDATE mutation
        const mutation = {
          id: generateId(),
          entity_type: ENTITY_TYPE.PROJECT,
          entity_id: id,
          operation: MUTATION_OPERATION.UPDATE,
          payload: {
            id,
            name: updatedRecord.name,
            description: updatedRecord.description
          },
          base_version: null,
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

      await db.projects.put(updatedRecord);
      resultRecord = updatedRecord;
    });

    return resultRecord;
  },

  /**
   * Delete a project.
   * - Local-only record (PENDING_CREATE): Physically removes project and its pending outbox entries,
   *   and cleans up local child tasks.
   * - Server-known record (SYNCED or PENDING_UPDATE): Marks sync_status = PENDING_DELETE,
   *   supersedes any pending UPDATE, and enqueues a DELETE mutation.
   */
  async deleteProject(id) {
    let deleted = false;

    await db.transaction('rw', db.projects, db.tasks, db.outbox, async () => {
      const existing = await db.projects.get(id);
      if (!existing) {
        deleted = false;
        return;
      }

      const isLocalOnly = existing.sync_status === SYNC_STATUS.PENDING_CREATE;
      const now = new Date().toISOString();

      if (isLocalOnly) {
        // Physical removal of project entity
        await db.projects.delete(id);

        // Remove any pending/failed outbox mutations for this project
        const projectMutations = await db.outbox
          .where('[entity_type+entity_id]')
          .equals([ENTITY_TYPE.PROJECT, id])
          .filter((m) => m.status !== MUTATION_STATUS.COMPLETED && m.status !== MUTATION_STATUS.PROCESSING)
          .toArray();

        if (projectMutations.length > 0) {
          await db.outbox.bulkDelete(projectMutations.map((m) => m.id));
        }

        // Cascade to child tasks
        const childTasks = await db.tasks.where('project_id').equals(id).toArray();
        for (const task of childTasks) {
          const isTaskLocalOnly = task.sync_status === SYNC_STATUS.PENDING_CREATE || task.version === 0;
          if (isTaskLocalOnly) {
            await db.tasks.delete(task.id);
            const taskMutations = await db.outbox
              .where('[entity_type+entity_id]')
              .equals([ENTITY_TYPE.TASK, task.id])
              .filter((m) => m.status !== MUTATION_STATUS.COMPLETED && m.status !== MUTATION_STATUS.PROCESSING)
              .toArray();
            if (taskMutations.length > 0) {
              await db.outbox.bulkDelete(taskMutations.map((m) => m.id));
            }
          } else {
            await db.tasks.update(task.id, {
              sync_status: SYNC_STATUS.PENDING_DELETE,
              updated_at: now
            });
            // Supersede any pending UPDATE
            const pendingTaskUpdates = await db.outbox
              .where('[entity_type+entity_id]')
              .equals([ENTITY_TYPE.TASK, task.id])
              .filter((m) => m.status === MUTATION_STATUS.PENDING)
              .toArray();
            if (pendingTaskUpdates.length > 0) {
              await db.outbox.bulkDelete(pendingTaskUpdates.map((m) => m.id));
            }
            // Enqueue DELETE mutation
            await db.outbox.add({
              id: generateId(),
              entity_type: ENTITY_TYPE.TASK,
              entity_id: task.id,
              operation: MUTATION_OPERATION.DELETE,
              payload: { id: task.id },
              base_version: task.version,
              idempotency_key: generateId(),
              status: MUTATION_STATUS.PENDING,
              created_at: now,
              updated_at: now,
              attempt_count: 0,
              last_attempt_at: null,
              last_error: null
            });
          }
        }
        deleted = true;
        return;
      }

      // Server-known project: mark as PENDING_DELETE tombstone
      await db.projects.update(id, {
        sync_status: SYNC_STATUS.PENDING_DELETE,
        updated_at: now
      });

      // Supersede any pending project UPDATE mutation
      const pendingProjUpdates = await db.outbox
        .where('[entity_type+entity_id]')
        .equals([ENTITY_TYPE.PROJECT, id])
        .filter((m) => m.status === MUTATION_STATUS.PENDING)
        .toArray();

      if (pendingProjUpdates.length > 0) {
        await db.outbox.bulkDelete(pendingProjUpdates.map((m) => m.id));
      }

      // Enqueue project DELETE mutation
      await db.outbox.add({
        id: generateId(),
        entity_type: ENTITY_TYPE.PROJECT,
        entity_id: id,
        operation: MUTATION_OPERATION.DELETE,
        payload: { id },
        base_version: null,
        idempotency_key: generateId(),
        status: MUTATION_STATUS.PENDING,
        created_at: now,
        updated_at: now,
        attempt_count: 0,
        last_attempt_at: null,
        last_error: null
      });

      // Handle child tasks
      const childTasks = await db.tasks.where('project_id').equals(id).toArray();
      for (const task of childTasks) {
        const isTaskLocalOnly = task.sync_status === SYNC_STATUS.PENDING_CREATE || task.version === 0;
        if (isTaskLocalOnly) {
          await db.tasks.delete(task.id);
          const taskMutations = await db.outbox
            .where('[entity_type+entity_id]')
            .equals([ENTITY_TYPE.TASK, task.id])
            .filter((m) => m.status !== MUTATION_STATUS.COMPLETED && m.status !== MUTATION_STATUS.PROCESSING)
            .toArray();
          if (taskMutations.length > 0) {
            await db.outbox.bulkDelete(taskMutations.map((m) => m.id));
          }
        } else {
          await db.tasks.update(task.id, {
            sync_status: SYNC_STATUS.PENDING_DELETE,
            updated_at: now
          });
          const pendingTaskUpdates = await db.outbox
            .where('[entity_type+entity_id]')
            .equals([ENTITY_TYPE.TASK, task.id])
            .filter((m) => m.status === MUTATION_STATUS.PENDING)
            .toArray();
          if (pendingTaskUpdates.length > 0) {
            await db.outbox.bulkDelete(pendingTaskUpdates.map((m) => m.id));
          }
          await db.outbox.add({
            id: generateId(),
            entity_type: ENTITY_TYPE.TASK,
            entity_id: task.id,
            operation: MUTATION_OPERATION.DELETE,
            payload: { id: task.id },
            base_version: task.version,
            idempotency_key: generateId(),
            status: MUTATION_STATUS.PENDING,
            created_at: now,
            updated_at: now,
            attempt_count: 0,
            last_attempt_at: null,
            last_error: null
          });
        }
      }
      deleted = true;
    });

    return deleted;
  },

  /**
   * Helper to bulk cache server records into local IndexedDB with SYNCED status.
   */
  async upsertSyncedProjects(projects) {
    const now = new Date().toISOString();
    const records = projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || '',
      created_at: p.created_at,
      updated_at: p.updated_at,
      sync_status: SYNC_STATUS.SYNCED,
      last_synced_at: now
    }));

    await db.projects.bulkPut(records);
    return records;
  },

  /**
   * Clear all projects from local store.
   */
  async clearProjects() {
    await db.projects.clear();
  }
};

export default projectRepository;

