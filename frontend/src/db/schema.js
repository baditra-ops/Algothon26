/**
 * FIELDNOTE Client-Side Database Schema & Domain Constants
 * Compatible with Dexie.js (IndexedDB wrapper)
 */

export const DB_NAME = 'fieldnote_db';
export const DB_VERSION = 2;

/**
 * Synchronization metadata status lifecycle:
 * - SYNCED: Matches central PostgreSQL/Supabase database.
 * - PENDING_CREATE: Created locally while offline, awaiting server creation.
 * - PENDING_UPDATE: Modified locally while offline, awaiting server reconciliation.
 * - PENDING_DELETE: Deleted locally, preserved so server can be informed to delete.
 * - CONFLICT: Server and client versions diverged, awaiting resolution (Prompt 7).
 */
export const SYNC_STATUS = {
  SYNCED: 'SYNCED',
  PENDING_CREATE: 'PENDING_CREATE',
  PENDING_UPDATE: 'PENDING_UPDATE',
  PENDING_DELETE: 'PENDING_DELETE',
  CONFLICT: 'CONFLICT'
};

export const TASK_STATUS = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED'
};

export const TASK_PRIORITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH'
};

/**
 * Outbox Mutation Entity Types
 */
export const ENTITY_TYPE = {
  PROJECT: 'project',
  TASK: 'task'
};

/**
 * Outbox Mutation Operations
 */
export const MUTATION_OPERATION = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE'
};

/**
 * Outbox Mutation Lifecycle Statuses
 */
export const MUTATION_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  FAILED: 'FAILED',
  COMPLETED: 'COMPLETED'
};

/**
 * Dexie table store index definitions.
 * Schema v1: Initial projects & tasks stores
 */
export const STORES_V1 = {
  projects: 'id, updated_at, sync_status',
  tasks: 'id, project_id, status, priority, updated_at, sync_status'
};

/**
 * Schema v2: Added outbox store for mutation queue
 * Index fields: id (PK), entity_type, entity_id, operation, status, created_at, idempotency_key, [entity_type+entity_id]
 */
export const STORES_V2 = {
  projects: 'id, updated_at, sync_status',
  tasks: 'id, project_id, status, priority, updated_at, sync_status',
  outbox: 'id, entity_type, entity_id, operation, status, created_at, idempotency_key, [entity_type+entity_id]'
};

