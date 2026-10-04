/**
 * Pull Service
 * Retrieves authoritative server projects and tasks from the REST API,
 * reconciling them into local IndexedDB while strictly shielding pending local mutations.
 */

import db from '../db/database.js';
import { SYNC_STATUS } from '../db/schema.js';
import * as api from '../services/api.js';

export const pullService = {
  /**
   * Pull all server projects into IndexedDB.
   * Protects local records with PENDING_CREATE, PENDING_UPDATE, PENDING_DELETE, or CONFLICT.
   */
  async pullProjects() {
    const serverProjects = await api.fetchProjects();
    const now = new Date().toISOString();
    let updatedCount = 0;
    let insertedCount = 0;
    let skippedCount = 0;

    await db.transaction('rw', db.projects, async () => {
      for (const sp of serverProjects) {
        const local = await db.projects.get(sp.id);

        if (!local) {
          // New server project: insert as SYNCED
          await db.projects.add({
            id: sp.id,
            name: sp.name,
            description: sp.description || '',
            created_at: sp.created_at,
            updated_at: sp.updated_at,
            sync_status: SYNC_STATUS.SYNCED,
            last_synced_at: now
          });
          insertedCount++;
        } else if (local.sync_status === SYNC_STATUS.SYNCED) {
          // Existing synced record: safe to refresh with server state
          await db.projects.put({
            ...local,
            name: sp.name,
            description: sp.description || '',
            created_at: sp.created_at,
            updated_at: sp.updated_at,
            sync_status: SYNC_STATUS.SYNCED,
            last_synced_at: now
          });
          updatedCount++;
        } else {
          // Local record has unsynced changes or conflict: PROTECT LOCAL STATE!
          skippedCount++;
        }
      }
    });

    return { insertedCount, updatedCount, skippedCount, totalServer: serverProjects.length };
  },

  /**
   * Pull all server tasks into IndexedDB.
   * Protects local records with PENDING_CREATE, PENDING_UPDATE, PENDING_DELETE, or CONFLICT.
   */
  async pullTasks() {
    const serverTasks = await api.fetchTasks();
    const now = new Date().toISOString();
    let updatedCount = 0;
    let insertedCount = 0;
    let skippedCount = 0;

    await db.transaction('rw', db.tasks, async () => {
      for (const st of serverTasks) {
        const local = await db.tasks.get(st.id);

        if (!local) {
          // New server task: insert as SYNCED
          await db.tasks.add({
            id: st.id,
            project_id: st.project_id,
            title: st.title,
            description: st.description || '',
            status: st.status,
            priority: st.priority,
            due_date: st.due_date || null,
            created_at: st.created_at,
            updated_at: st.updated_at,
            version: st.version, // Authoritative server version
            sync_status: SYNC_STATUS.SYNCED,
            last_synced_at: now
          });
          insertedCount++;
        } else if (local.sync_status === SYNC_STATUS.SYNCED) {
          // Synced local task: refresh with server data
          await db.tasks.put({
            ...local,
            project_id: st.project_id,
            title: st.title,
            description: st.description || '',
            status: st.status,
            priority: st.priority,
            due_date: st.due_date || null,
            created_at: st.created_at,
            updated_at: st.updated_at,
            version: st.version,
            sync_status: SYNC_STATUS.SYNCED,
            last_synced_at: now
          });
          updatedCount++;
        } else {
          // Local record has pending changes: PROTECT LOCAL STATE!
          skippedCount++;
        }
      }
    });

    return { insertedCount, updatedCount, skippedCount, totalServer: serverTasks.length };
  },

  /**
   * Complete server reconciliation: pull projects first, then tasks.
   */
  async pullServerData() {
    const projectStats = await this.pullProjects();
    const taskStats = await this.pullTasks();

    return {
      projects: projectStats,
      tasks: taskStats
    };
  }
};

export default pullService;
