import db from '../database.js';
import { MUTATION_STATUS, MUTATION_OPERATION, ENTITY_TYPE } from '../schema.js';
import { validateMutation } from '../validation.js';

/**
 * Valid state transitions for outbox mutations:
 * PENDING -> PROCESSING
 * PROCESSING -> COMPLETED
 * PROCESSING -> FAILED
 * FAILED -> PENDING (manual retry)
 */
const VALID_TRANSITIONS = {
  [MUTATION_STATUS.PENDING]: [MUTATION_STATUS.PROCESSING],
  [MUTATION_STATUS.PROCESSING]: [MUTATION_STATUS.COMPLETED, MUTATION_STATUS.FAILED],
  [MUTATION_STATUS.FAILED]: [MUTATION_STATUS.PENDING, MUTATION_STATUS.PROCESSING],
  [MUTATION_STATUS.COMPLETED]: [] // Terminal state
};

export const outboxRepository = {
  /**
   * Enqueue a new mutation record into the outbox.
   * Can be called within an active Dexie transaction or standalone.
   */
  async enqueueMutation(mutation) {
    validateMutation(mutation);

    // Ensure idempotency key and ID are present
    const record = {
      id: mutation.id,
      entity_type: mutation.entity_type,
      entity_id: mutation.entity_id,
      operation: mutation.operation,
      payload: mutation.payload,
      base_version: mutation.base_version !== undefined ? mutation.base_version : null,
      idempotency_key: mutation.idempotency_key,
      status: mutation.status || MUTATION_STATUS.PENDING,
      created_at: mutation.created_at || new Date().toISOString(),
      updated_at: mutation.updated_at || new Date().toISOString(),
      attempt_count: mutation.attempt_count || 0,
      last_attempt_at: mutation.last_attempt_at || null,
      last_error: mutation.last_error || null
    };

    await db.outbox.add(record);
    return record;
  },

  /**
   * Retrieve a mutation by its unique UUID.
   */
  async getMutationById(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('A valid mutation ID string is required.');
    }
    const record = await db.outbox.get(id);
    return record || null;
  },

  /**
   * Retrieve all mutations currently in PENDING status, sorted chronologically (FIFO).
   */
  async getPendingMutations() {
    return await db.outbox
      .where('status')
      .equals(MUTATION_STATUS.PENDING)
      .sortBy('created_at');
  },

  /**
   * Retrieve all mutations for a specific entity (e.g. project or task).
   */
  async getMutationsByEntity(entityType, entityId) {
    if (!entityType || !entityId) {
      throw new Error('entityType and entityId are required.');
    }

    return await db.outbox
      .where('[entity_type+entity_id]')
      .equals([entityType, entityId])
      .sortBy('created_at');
  },

  /**
   * Retrieve all mutations in the outbox, ordered with most recent first.
   */
  async getAllMutations() {
    return await db.outbox.orderBy('created_at').reverse().toArray();
  },

  /**
   * Update the status and tracking metadata of an existing mutation.
   * Validates status transitions and preserves the original idempotency key.
   */
  async updateMutationStatus(id, newStatus, options = {}) {
    if (!id || typeof id !== 'string') {
      throw new Error('Mutation ID is required for status update.');
    }

    const existing = await db.outbox.get(id);
    if (!existing) {
      throw new Error(`Mutation with ID ${id} not found.`);
    }

    if (!Object.values(MUTATION_STATUS).includes(newStatus)) {
      throw new Error(`Invalid status '${newStatus}'. Allowed: ${Object.values(MUTATION_STATUS).join(', ')}`);
    }

    // Validate lifecycle transition (allow no-op if status is unchanged)
    if (existing.status !== newStatus) {
      const allowedNext = VALID_TRANSITIONS[existing.status] || [];
      if (!allowedNext.includes(newStatus)) {
        throw new Error(
          `Invalid mutation status transition from '${existing.status}' to '${newStatus}'.`
        );
      }
    }

    const now = new Date().toISOString();
    const updates = {
      status: newStatus,
      updated_at: now,
      // Strictly preserve idempotency_key
      idempotency_key: existing.idempotency_key
    };

    if (options.attempt_count !== undefined) {
      updates.attempt_count = options.attempt_count;
    }

    if (options.last_attempt_at !== undefined) {
      updates.last_attempt_at = options.last_attempt_at;
    }

    if (options.last_error !== undefined) {
      updates.last_error = options.last_error ? String(options.last_error).slice(0, 500) : null;
    }

    await db.outbox.update(id, updates);
    return { ...existing, ...updates };
  },

  /**
   * Transition mutation from PENDING to PROCESSING.
   * Increments attempt_count and sets last_attempt_at timestamp.
   */
  async markMutationProcessing(id) {
    const existing = await db.outbox.get(id);
    if (!existing) {
      throw new Error(`Mutation with ID ${id} not found.`);
    }

    return await this.updateMutationStatus(id, MUTATION_STATUS.PROCESSING, {
      attempt_count: (existing.attempt_count || 0) + 1,
      last_attempt_at: new Date().toISOString(),
      last_error: null
    });
  },

  /**
   * Transition mutation from PROCESSING to FAILED.
   * Records safe error message without exposing raw stack traces.
   */
  async markMutationFailed(id, error) {
    const safeMessage = error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown processing error';

    return await this.updateMutationStatus(id, MUTATION_STATUS.FAILED, {
      last_error: safeMessage
    });
  },

  /**
   * Transition mutation from PROCESSING to COMPLETED.
   * Records completion and clears any previous error message.
   */
  async markMutationCompleted(id) {
    return await this.updateMutationStatus(id, MUTATION_STATUS.COMPLETED, {
      last_error: null
    });
  },

  /**
   * Get aggregated outbox telemetry and status counts.
   */
  async getOutboxStats() {
    const all = await db.outbox.toArray();

    const statusCounts = {
      [MUTATION_STATUS.PENDING]: 0,
      [MUTATION_STATUS.PROCESSING]: 0,
      [MUTATION_STATUS.FAILED]: 0,
      [MUTATION_STATUS.COMPLETED]: 0
    };

    const operationCounts = {
      [MUTATION_OPERATION.CREATE]: 0,
      [MUTATION_OPERATION.UPDATE]: 0,
      [MUTATION_OPERATION.DELETE]: 0
    };

    const entityCounts = {
      [ENTITY_TYPE.PROJECT]: 0,
      [ENTITY_TYPE.TASK]: 0
    };

    for (const m of all) {
      if (statusCounts[m.status] !== undefined) {
        statusCounts[m.status]++;
      }
      if (operationCounts[m.operation] !== undefined) {
        operationCounts[m.operation]++;
      }
      if (entityCounts[m.entity_type] !== undefined) {
        entityCounts[m.entity_type]++;
      }
    }

    return {
      total: all.length,
      pending: statusCounts[MUTATION_STATUS.PENDING],
      processing: statusCounts[MUTATION_STATUS.PROCESSING],
      failed: statusCounts[MUTATION_STATUS.FAILED],
      completed: statusCounts[MUTATION_STATUS.COMPLETED],
      statusCounts,
      operationCounts,
      entityCounts
    };
  },

  /**
   * Developer utility: Explicitly clean up all COMPLETED mutations from the outbox.
   * Only deletes records that have completed successfully.
   */
  async clearCompletedMutations() {
    const completed = await db.outbox
      .where('status')
      .equals(MUTATION_STATUS.COMPLETED)
      .toArray();

    if (completed.length === 0) {
      return 0;
    }

    const ids = completed.map((m) => m.id);
    await db.outbox.bulkDelete(ids);
    return ids.length;
  }
};

export default outboxRepository;
