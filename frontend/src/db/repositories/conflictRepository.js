import db from '../database.js';
import { SYNC_STATUS, MUTATION_STATUS, MUTATION_OPERATION, ENTITY_TYPE } from '../schema.js';
import syncManager from '../../sync/syncManager.js';
import syncState, { SYNC_STATE } from '../../sync/syncState.js';

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

/**
 * Conflict Repository
 * Manages persistent conflict records and transactional resolution strategies:
 * - KEEP_LOCAL: Re-applies offline changes with latest server version as optimistic base
 * - KEEP_SERVER: Adopts authoritative server data and discards local changes
 * - MERGED: Explicit user field-level merge with latest server version
 */
export const conflictRepository = {
  /**
   * Persistently record an HTTP 409 version conflict.
   * If a pending conflict already exists for the entity, updates snapshots in-place.
   */
  async recordConflict({
    entity_type = 'task',
    entity_id,
    mutation_id,
    local_snapshot,
    server_snapshot,
    base_version,
    server_version
  }) {
    if (!entity_id) {
      throw new Error('entity_id is required to record a conflict.');
    }

    const now = new Date().toISOString();
    const serverVer = server_version ?? server_snapshot?.version ?? null;

    // Check if there is an existing PENDING conflict for this entity
    const existing = await db.conflicts
      .where('entity_id')
      .equals(entity_id)
      .filter((c) => c.status === 'PENDING')
      .first();

    const record = {
      id: existing ? existing.id : generateId(),
      entity_type,
      entity_id,
      mutation_id: mutation_id || existing?.mutation_id || null,
      local_snapshot: local_snapshot ? { ...local_snapshot } : existing?.local_snapshot || null,
      server_snapshot: server_snapshot ? { ...server_snapshot } : existing?.server_snapshot || null,
      base_version: base_version !== undefined ? base_version : existing?.base_version ?? null,
      server_version: serverVer,
      created_at: existing ? existing.created_at : now,
      updated_at: now,
      status: 'PENDING',
      resolution: null,
      resolved_at: null
    };

    await db.conflicts.put(record);
    return record;
  },

  /**
   * Retrieve a conflict record by its UUID.
   */
  async getConflictById(id) {
    if (!id) return null;
    return (await db.conflicts.get(id)) || null;
  },

  /**
   * Retrieve all currently active (PENDING) conflicts requiring user attention.
   */
  async getPendingConflicts() {
    return await db.conflicts.where('status').equals('PENDING').toArray();
  },

  /**
   * Retrieve all conflict records including historical/resolved records.
   */
  async getAllConflicts() {
    return await db.conflicts.toArray();
  },

  /**
   * Find an active pending conflict for a specific entity.
   */
  async getPendingConflictByEntity(entityType, entityId) {
    return await db.conflicts
      .where('entity_id')
      .equals(entityId)
      .filter((c) => c.entity_type === entityType && c.status === 'PENDING')
      .first();
  },

  /**
   * Atomically resolve a conflict record using one of three strategies:
   * 1. 'KEEP_LOCAL'
   * 2. 'KEEP_SERVER'
   * 3. 'MERGED'
   *
   * Enforces:
   * - Race-condition protection (double-resolution prevented)
   * - Atomic IndexedDB transaction (tasks + outbox + conflicts)
   * - Superseding / removal of old conflicting mutation
   * - Triggering background sync if online
   */
  async resolveConflict(conflictId, resolutionStrategy, mergedData = null) {
    const validStrategies = ['KEEP_LOCAL', 'KEEP_SERVER', 'MERGED'];
    if (!validStrategies.includes(resolutionStrategy)) {
      throw new Error(`Invalid resolution strategy '${resolutionStrategy}'. Must be one of: ${validStrategies.join(', ')}`);
    }

    const conflict = await db.conflicts.get(conflictId);
    if (!conflict) {
      throw new Error(`Conflict record with ID '${conflictId}' not found.`);
    }

    // Race-condition guard: already resolved
    if (conflict.status === 'RESOLVED') {
      return {
        success: true,
        alreadyResolved: true,
        conflict
      };
    }

    const now = new Date().toISOString();
    const serverVersion = conflict.server_version ?? conflict.server_snapshot?.version;

    if (serverVersion === null || serverVersion === undefined) {
      throw new Error('Cannot resolve conflict: server_version is missing from conflict record.');
    }

    let resultingTask = null;
    let newMutation = null;

    // ==========================================
    // ATOMIC TRANSACTION: TASKS + OUTBOX + CONFLICTS
    // ==========================================
    await db.transaction('rw', db.tasks, db.outbox, db.conflicts, async () => {
      // Re-fetch inside transaction for concurrency safety
      const currentConflict = await db.conflicts.get(conflictId);
      if (currentConflict.status === 'RESOLVED') {
        return;
      }

      const entityId = conflict.entity_id;
      const currentLocalTask = (await db.tasks.get(entityId)) || conflict.local_snapshot;

      // ------------------------------------------------------------------
      // STRATEGY 1: KEEP LOCAL
      // "I want to keep my offline changes, applying them on top of server version"
      // ------------------------------------------------------------------
      if (resolutionStrategy === 'KEEP_LOCAL') {
        const localData = conflict.local_snapshot || currentLocalTask;

        // 1. Update local task with server_version as base version
        resultingTask = {
          ...currentLocalTask,
          title: localData.title,
          description: localData.description || '',
          status: localData.status,
          priority: localData.priority,
          due_date: localData.due_date || null,
          version: serverVersion, // Adopts latest server version as new concurrency base
          sync_status: SYNC_STATUS.PENDING_UPDATE,
          updated_at: now
        };
        await db.tasks.put(resultingTask);

        // 2. Create NEW UPDATE mutation using latest server version
        newMutation = {
          id: generateId(),
          entity_type: ENTITY_TYPE.TASK,
          entity_id: entityId,
          operation: MUTATION_OPERATION.UPDATE,
          payload: {
            id: entityId,
            project_id: resultingTask.project_id,
            title: resultingTask.title,
            description: resultingTask.description,
            status: resultingTask.status,
            priority: resultingTask.priority,
            due_date: resultingTask.due_date
          },
          base_version: serverVersion, // Crucial: optimistic concurrency base
          idempotency_key: generateId(),
          status: MUTATION_STATUS.PENDING,
          created_at: now,
          updated_at: now,
          attempt_count: 0,
          last_attempt_at: null,
          last_error: null
        };
        await db.outbox.add(newMutation);

        // 3. Remove old conflicting mutation so it can NEVER be resent
        if (conflict.mutation_id) {
          await db.outbox.delete(conflict.mutation_id);
        }

        // 4. Mark conflict record as RESOLVED
        currentConflict.status = 'RESOLVED';
        currentConflict.resolution = 'KEEP_LOCAL';
        currentConflict.resolved_at = now;
        currentConflict.updated_at = now;
        await db.conflicts.put(currentConflict);
      }

      // ------------------------------------------------------------------
      // STRATEGY 2: KEEP SERVER
      // "Discard my local changes and accept the server's authoritative version"
      // ------------------------------------------------------------------
      else if (resolutionStrategy === 'KEEP_SERVER') {
        const serverData = conflict.server_snapshot;
        if (!serverData) {
          throw new Error('Cannot execute KEEP_SERVER: server_snapshot is missing.');
        }

        // 1. Overwrite local task with server snapshot
        resultingTask = {
          id: entityId,
          project_id: serverData.project_id || currentLocalTask?.project_id,
          title: serverData.title,
          description: serverData.description || '',
          status: serverData.status,
          priority: serverData.priority,
          due_date: serverData.due_date || null,
          created_at: serverData.created_at || currentLocalTask?.created_at || now,
          updated_at: serverData.updated_at || now,
          version: serverVersion,
          sync_status: SYNC_STATUS.SYNCED,
          last_synced_at: now
        };
        await db.tasks.put(resultingTask);

        // 2. Remove old conflicting mutation so no stale update is sent
        if (conflict.mutation_id) {
          await db.outbox.delete(conflict.mutation_id);
        }

        // 3. Do NOT create a replacement mutation (server already has this state!)
        // 4. Mark conflict as RESOLVED
        currentConflict.status = 'RESOLVED';
        currentConflict.resolution = 'KEEP_SERVER';
        currentConflict.resolved_at = now;
        currentConflict.updated_at = now;
        await db.conflicts.put(currentConflict);
      }

      // ------------------------------------------------------------------
      // STRATEGY 3: MERGED / EDIT
      // "Explicitly combine selected fields from local and server snapshots"
      // ------------------------------------------------------------------
      else if (resolutionStrategy === 'MERGED') {
        if (!mergedData || typeof mergedData !== 'object') {
          throw new Error('mergedData object with field selections is required for MERGED resolution.');
        }

        // 1. Update local task with merged data
        resultingTask = {
          ...currentLocalTask,
          id: entityId,
          project_id: mergedData.project_id || currentLocalTask?.project_id || conflict.server_snapshot?.project_id,
          title: (mergedData.title || currentLocalTask?.title || '').trim(),
          description: (mergedData.description !== undefined ? mergedData.description : currentLocalTask?.description || '').trim(),
          status: mergedData.status || currentLocalTask?.status,
          priority: mergedData.priority || currentLocalTask?.priority,
          due_date: mergedData.due_date !== undefined ? mergedData.due_date : currentLocalTask?.due_date || null,
          version: serverVersion, // Use server version as base for optimistic concurrency
          sync_status: SYNC_STATUS.PENDING_UPDATE,
          updated_at: now
        };
        await db.tasks.put(resultingTask);

        // 2. Create NEW UPDATE mutation
        newMutation = {
          id: generateId(),
          entity_type: ENTITY_TYPE.TASK,
          entity_id: entityId,
          operation: MUTATION_OPERATION.UPDATE,
          payload: {
            id: entityId,
            project_id: resultingTask.project_id,
            title: resultingTask.title,
            description: resultingTask.description,
            status: resultingTask.status,
            priority: resultingTask.priority,
            due_date: resultingTask.due_date
          },
          base_version: serverVersion,
          idempotency_key: generateId(),
          status: MUTATION_STATUS.PENDING,
          created_at: now,
          updated_at: now,
          attempt_count: 0,
          last_attempt_at: null,
          last_error: null
        };
        await db.outbox.add(newMutation);

        // 3. Remove old conflicting mutation
        if (conflict.mutation_id) {
          await db.outbox.delete(conflict.mutation_id);
        }

        // 4. Mark conflict record as RESOLVED
        currentConflict.status = 'RESOLVED';
        currentConflict.resolution = 'MERGED';
        currentConflict.resolved_at = now;
        currentConflict.updated_at = now;
        await db.conflicts.put(currentConflict);
      }
    });

    // Post-transaction updates
    const remainingConflicts = await db.conflicts
      .where('status')
      .equals('PENDING')
      .count();

    // If no more conflicts remain, clear CONFLICT sync state
    if (remainingConflicts === 0 && syncState.getState().state === SYNC_STATE.CONFLICT) {
      const isOnline = (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean')
        ? navigator.onLine
        : true;
      syncState.setState({ state: isOnline ? SYNC_STATE.IDLE : SYNC_STATE.OFFLINE });
    }

    // Trigger sync for strategies that queued a new mutation (KEEP_LOCAL, MERGED)
    if (newMutation) {
      syncManager.notifyMutationCreated();
    }

    return {
      success: true,
      strategy: resolutionStrategy,
      task: resultingTask,
      newMutation
    };
  }
};

export default conflictRepository;
