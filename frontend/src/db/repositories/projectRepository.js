import db from '../database.js';
import { SYNC_STATUS } from '../schema.js';
import { validateProject } from '../validation.js';

/**
 * Generate a client UUIDv4 using native browser crypto.
 */
function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Standard fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const projectRepository = {
  /**
   * Create a new project locally in IndexedDB.
   */
  async createProject(projectData) {
    validateProject(projectData);

    const now = new Date().toISOString();
    const id = projectData.id || generateId();

    const record = {
      id,
      name: projectData.name.trim(),
      description: projectData.description ? projectData.description.trim() : '',
      created_at: projectData.created_at || now,
      updated_at: projectData.updated_at || now,
      sync_status: projectData.sync_status || SYNC_STATUS.PENDING_CREATE,
      last_synced_at: projectData.last_synced_at || null
    };

    await db.projects.add(record);
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
   * Transitions sync_status from SYNCED to PENDING_UPDATE.
   * If already PENDING_CREATE, preserves PENDING_CREATE so sync will CREATE rather than UPDATE.
   */
  async updateProject(id, updates) {
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

    await db.projects.put(updatedRecord);
    return updatedRecord;
  },

  /**
   * Delete a project.
   * - Local-only record (PENDING_CREATE): Physically removes record and its local tasks.
   * - Server-known record (SYNCED or PENDING_UPDATE): Marks sync_status = PENDING_DELETE so future sync issues server DELETE.
   */
  async deleteProject(id) {
    const existing = await db.projects.get(id);
    if (!existing) {
      return false;
    }

    const isLocalOnly = existing.sync_status === SYNC_STATUS.PENDING_CREATE;

    if (isLocalOnly) {
      // Physical removal of project and cascade local-only tasks
      await db.transaction('rw', db.projects, db.tasks, async () => {
        await db.projects.delete(id);
        const childTasks = await db.tasks.where('project_id').equals(id).toArray();
        for (const task of childTasks) {
          if (task.sync_status === SYNC_STATUS.PENDING_CREATE) {
            await db.tasks.delete(task.id);
          } else {
            await db.tasks.update(task.id, {
              sync_status: SYNC_STATUS.PENDING_DELETE,
              updated_at: new Date().toISOString()
            });
          }
        }
      });
      return true;
    }

    // Server-known project: mark as PENDING_DELETE
    const now = new Date().toISOString();
    await db.transaction('rw', db.projects, db.tasks, async () => {
      await db.projects.update(id, {
        sync_status: SYNC_STATUS.PENDING_DELETE,
        updated_at: now
      });

      // Mark child tasks as PENDING_DELETE as well
      const childTasks = await db.tasks.where('project_id').equals(id).toArray();
      for (const task of childTasks) {
        if (task.sync_status === SYNC_STATUS.PENDING_CREATE) {
          await db.tasks.delete(task.id);
        } else {
          await db.tasks.update(task.id, {
            sync_status: SYNC_STATUS.PENDING_DELETE,
            updated_at: now
          });
        }
      }
    });

    return true;
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
