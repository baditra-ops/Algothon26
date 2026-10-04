/**
 * Mutation Processor
 * Translates single outbox mutations into concrete REST API transmissions,
 * manages HTTP 409 version conflicts, applies server responses, and orchestrates bounded retries.
 */

import db from '../db/database.js';
import { SYNC_STATUS, MUTATION_STATUS } from '../db/schema.js';
import outboxRepository from '../db/repositories/outboxRepository.js';
import conflictRepository from '../db/repositories/conflictRepository.js';
import * as api from '../services/api.js';

export const MAX_RETRIES = 3;

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

/**
 * Determine if an HTTP or network error is considered transient and safe to retry.
 */
export function isTransientError(err) {
  if (!err) return false;

  // Network / connection drop errors
  if (err.name === 'TypeError' || err.message?.includes('fetch') || err.message?.includes('NetworkError')) {
    return true;
  }

  // HTTP status codes that represent transient server or network conditions
  const transientStatuses = [408, 429, 500, 502, 503, 504];
  if (err.status && transientStatuses.includes(err.status)) {
    return true;
  }

  return false;
}

/**
 * Process a single outbox mutation against the backend REST API.
 */
export async function processMutation(mutation) {
  if (!mutation || !mutation.id) {
    throw new Error('Invalid mutation object passed to processor.');
  }

  // 1. Mark processing in outbox
  const processingMut = await outboxRepository.markMutationProcessing(mutation.id);
  const currentAttempts = processingMut.attempt_count;

  try {
    const { entity_type, operation, entity_id, payload, base_version } = mutation;

    // ==========================================
    // ENTITY: PROJECT
    // ==========================================
    if (entity_type === 'project') {
      if (operation === 'CREATE') {
        const serverProject = await api.createProject({
          name: payload.name,
          description: payload.description
        });

        const now = new Date().toISOString();

        // Atomically update local IndexedDB record
        await db.transaction('rw', db.projects, db.tasks, db.outbox, async () => {
          const localProj = await db.projects.get(entity_id);

          if (serverProject.id !== entity_id) {
            // Explicit server ID remapping: replace local project key
            if (localProj) {
              await db.projects.delete(entity_id);
              await db.projects.put({
                ...localProj,
                id: serverProject.id,
                name: serverProject.name,
                description: serverProject.description || '',
                created_at: serverProject.created_at || localProj.created_at,
                updated_at: serverProject.updated_at || now,
                sync_status: SYNC_STATUS.SYNCED,
                last_synced_at: now
              });
            }

            // Remap child tasks project_id
            const childTasks = await db.tasks.where('project_id').equals(entity_id).toArray();
            for (const t of childTasks) {
              await db.tasks.update(t.id, { project_id: serverProject.id });
            }

            // Remap child tasks outbox mutations
            const pendingChildMutations = await db.outbox
              .where('status')
              .equals(MUTATION_STATUS.PENDING)
              .filter((m) => m.entity_type === 'task' && m.payload?.project_id === entity_id)
              .toArray();

            for (const cm of pendingChildMutations) {
              cm.payload.project_id = serverProject.id;
              await db.outbox.put(cm);
            }
          } else if (localProj) {
            await db.projects.put({
              ...localProj,
              name: serverProject.name,
              description: serverProject.description || '',
              created_at: serverProject.created_at || localProj.created_at,
              updated_at: serverProject.updated_at || now,
              sync_status: SYNC_STATUS.SYNCED,
              last_synced_at: now
            });
          }

          // Mark mutation completed
          await outboxRepository.markMutationCompleted(mutation.id);
        });

        return { status: 'COMPLETED', entity_type, entity_id };
      }

      if (operation === 'UPDATE') {
        const serverProject = await api.updateProject(entity_id, {
          name: payload.name,
          description: payload.description
        });

        const now = new Date().toISOString();
        const localProj = await db.projects.get(entity_id);

        if (localProj) {
          // If local project was edited while in-flight, preserve newer local edits
          const hasNewerLocalEdits = localProj.updated_at > mutation.updated_at;
          await db.projects.put({
            ...localProj,
            name: hasNewerLocalEdits ? localProj.name : serverProject.name,
            description: hasNewerLocalEdits ? localProj.description : serverProject.description,
            sync_status: hasNewerLocalEdits ? SYNC_STATUS.PENDING_UPDATE : SYNC_STATUS.SYNCED,
            last_synced_at: now
          });
        }

        await outboxRepository.markMutationCompleted(mutation.id);
        return { status: 'COMPLETED', entity_type, entity_id };
      }

      if (operation === 'DELETE') {
        try {
          await api.deleteProject(entity_id);
        } catch (delErr) {
          // 404 indicates resource is already deleted on server (idempotently reconciled)
          if (delErr.status !== 404) {
            throw delErr;
          }
        }

        // Physically remove tombstone from Dexie
        await db.projects.delete(entity_id);
        await outboxRepository.markMutationCompleted(mutation.id);
        return { status: 'COMPLETED', entity_type, entity_id };
      }
    }

    // ==========================================
    // ENTITY: TASK
    // ==========================================
    if (entity_type === 'task') {
      if (operation === 'CREATE') {
        const serverTask = await api.createTask({
          project_id: payload.project_id,
          title: payload.title,
          description: payload.description,
          status: payload.status,
          priority: payload.priority,
          due_date: payload.due_date
        });

        const now = new Date().toISOString();

        await db.transaction('rw', db.tasks, db.outbox, async () => {
          const localTask = await db.tasks.get(entity_id);

          if (serverTask.id !== entity_id) {
            // Remap task ID if server generated a different UUID
            if (localTask) {
              await db.tasks.delete(entity_id);
              await db.tasks.put({
                ...localTask,
                id: serverTask.id,
                project_id: serverTask.project_id,
                title: serverTask.title,
                description: serverTask.description || '',
                status: serverTask.status,
                priority: serverTask.priority,
                due_date: serverTask.due_date,
                created_at: serverTask.created_at || localTask.created_at,
                updated_at: serverTask.updated_at || now,
                version: serverTask.version, // Authoritative server version (e.g. 1)
                sync_status: SYNC_STATUS.SYNCED,
                last_synced_at: now
              });
            }

            // Remap any subsequent pending mutations on this task
            const taskMutations = await db.outbox
              .where('[entity_type+entity_id]')
              .equals(['task', entity_id])
              .toArray();

            for (const tm of taskMutations) {
              if (tm.id !== mutation.id) {
                tm.entity_id = serverTask.id;
                await db.outbox.put(tm);
              }
            }
          } else if (localTask) {
            await db.tasks.put({
              ...localTask,
              title: serverTask.title,
              description: serverTask.description || '',
              status: serverTask.status,
              priority: serverTask.priority,
              due_date: serverTask.due_date,
              created_at: serverTask.created_at || localTask.created_at,
              updated_at: serverTask.updated_at || now,
              version: serverTask.version,
              sync_status: SYNC_STATUS.SYNCED,
              last_synced_at: now
            });
          }

          await outboxRepository.markMutationCompleted(mutation.id);
        });

        return { status: 'COMPLETED', entity_type, entity_id };
      }

      if (operation === 'UPDATE') {
        try {
          // Send base_version for server optimistic concurrency verification
          const serverTask = await api.updateTask(entity_id, {
            project_id: payload.project_id,
            title: payload.title,
            description: payload.description,
            status: payload.status,
            priority: payload.priority,
            due_date: payload.due_date,
            version: base_version
          });

          const now = new Date().toISOString();
          const localTask = await db.tasks.get(entity_id);

          if (localTask) {
            const hasNewerLocalEdits = localTask.updated_at > mutation.updated_at;
            await db.tasks.put({
              ...localTask,
              title: hasNewerLocalEdits ? localTask.title : serverTask.title,
              description: hasNewerLocalEdits ? localTask.description : serverTask.description,
              status: hasNewerLocalEdits ? localTask.status : serverTask.status,
              priority: hasNewerLocalEdits ? localTask.priority : serverTask.priority,
              due_date: hasNewerLocalEdits ? localTask.due_date : serverTask.due_date,
              version: serverTask.version, // Adopt new server version
              sync_status: hasNewerLocalEdits ? SYNC_STATUS.PENDING_UPDATE : SYNC_STATUS.SYNCED,
              last_synced_at: now
            });
          }

          await outboxRepository.markMutationCompleted(mutation.id);
          return { status: 'COMPLETED', entity_type, entity_id };
        } catch (err) {
          // Check for HTTP 409 Optimistic Concurrency Conflict
          if (err.status === 409 || err.code === 'VERSION_CONFLICT') {
            const localTask = await db.tasks.get(entity_id);
            const serverTaskSnapshot = err.serverTask || null;

            // 1. Mark local task as CONFLICT
            if (localTask) {
              await db.tasks.update(entity_id, {
                sync_status: SYNC_STATUS.CONFLICT,
                updated_at: new Date().toISOString()
              });
            }

            // 2. Persist explicit conflict snapshot in db.conflicts
            await conflictRepository.recordConflict({
              entity_type: 'task',
              entity_id,
              mutation_id: mutation.id,
              local_snapshot: localTask ? { ...localTask } : null,
              server_snapshot: serverTaskSnapshot,
              base_version: base_version,
              server_version: serverTaskSnapshot?.version || null
            });

            // 3. Mark mutation as CONFLICT (do not complete, do not retry)
            await outboxRepository.markMutationConflict(mutation.id, err);

            return {
              status: 'CONFLICT',
              entity_type,
              entity_id,
              serverTask: serverTaskSnapshot,
              error: err.message
            };
          }
          throw err;
        }
      }

      if (operation === 'DELETE') {
        try {
          await api.deleteTask(entity_id);
        } catch (delErr) {
          if (delErr.status !== 404) {
            throw delErr;
          }
        }

        // Physically remove tombstone from Dexie
        await db.tasks.delete(entity_id);
        await outboxRepository.markMutationCompleted(mutation.id);
        return { status: 'COMPLETED', entity_type, entity_id };
      }
    }

    throw new Error(`Unsupported entity_type '${entity_type}' or operation '${operation}'`);
  } catch (err) {
    const isTransient = isTransientError(err);

    // If retries exhausted or non-transient, mark FAILED
    if (!isTransient || currentAttempts >= MAX_RETRIES) {
      await outboxRepository.markMutationFailed(mutation.id, err);
      return {
        status: 'FAILED',
        error: err.message || 'Processing failed',
        isTransient: false
      };
    }

    // Transient failure with retries remaining: reset to PENDING with attempt count preserved
    await outboxRepository.updateMutationStatus(mutation.id, MUTATION_STATUS.PENDING, {
      attempt_count: currentAttempts,
      last_attempt_at: new Date().toISOString(),
      last_error: `Transient error: ${err.message || 'Network issue'}`
    });

    return {
      status: 'RETRY',
      error: err.message,
      isTransient: true,
      attemptsRemaining: MAX_RETRIES - currentAttempts
    };
  }
}
