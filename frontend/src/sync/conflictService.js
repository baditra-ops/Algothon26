import conflictRepository from '../db/repositories/conflictRepository.js';
import syncManager from './syncManager.js';

/**
 * Compare local and server snapshots to determine field-level divergence.
 */
export function calculateFieldDiffs(localSnapshot = {}, serverSnapshot = {}) {
  const fields = [
    { key: 'title', label: 'Task Title' },
    { key: 'description', label: 'Description' },
    { key: 'status', label: 'Status' },
    { key: 'priority', label: 'Priority' },
    { key: 'due_date', label: 'Due Date' }
  ];

  return fields.map((f) => {
    const localVal = localSnapshot?.[f.key] ?? '';
    const serverVal = serverSnapshot?.[f.key] ?? '';
    const isDifferent = String(localVal).trim() !== String(serverVal).trim();

    return {
      key: f.key,
      label: f.label,
      localValue: localVal,
      serverValue: serverVal,
      isDifferent
    };
  });
}

/**
 * High-level Conflict Service for UI interaction
 */
export const conflictService = {
  /**
   * Retrieve all unresolved (PENDING) conflicts.
   */
  async getPendingConflicts() {
    return await conflictRepository.getPendingConflicts();
  },

  /**
   * Retrieve a conflict by its ID.
   */
  async getConflictById(id) {
    return await conflictRepository.getConflictById(id);
  },

  /**
   * Calculate diffs for a conflict record.
   */
  getDiffs(conflict) {
    if (!conflict) return [];
    return calculateFieldDiffs(conflict.local_snapshot, conflict.server_snapshot);
  },

  /**
   * Resolve conflict with specified strategy: 'KEEP_LOCAL' | 'KEEP_SERVER' | 'MERGED'
   */
  async resolveConflict(conflictId, strategy, mergedData = null) {
    return await conflictRepository.resolveConflict(conflictId, strategy, mergedData);
  },

  /**
   * Convenience: Keep local changes
   */
  async keepLocal(conflictId) {
    return await conflictRepository.resolveConflict(conflictId, 'KEEP_LOCAL');
  },

  /**
   * Convenience: Keep server version
   */
  async keepServer(conflictId) {
    return await conflictRepository.resolveConflict(conflictId, 'KEEP_SERVER');
  },

  /**
   * Convenience: Apply merged fields
   */
  async merge(conflictId, mergedData) {
    return await conflictRepository.resolveConflict(conflictId, 'MERGED', mergedData);
  }
};

export default conflictService;
