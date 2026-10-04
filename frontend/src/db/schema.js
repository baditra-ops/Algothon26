/**
 * FIELDNOTE Client-Side Database Schema & Domain Constants
 * Compatible with Dexie.js (IndexedDB wrapper)
 */

export const DB_NAME = 'fieldnote_db';
export const DB_VERSION = 1;

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
 * Dexie table store index definitions.
 * Primary key: id (UUID string)
 * Indexed fields are optimized for queries: project_id, status, priority, updated_at, sync_status
 */
export const STORES_V1 = {
  projects: 'id, updated_at, sync_status',
  tasks: 'id, project_id, status, priority, updated_at, sync_status'
};
