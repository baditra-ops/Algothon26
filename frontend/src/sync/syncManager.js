/**
 * Synchronization Manager
 * Coordinates lifecycle triggers (startup, online event, local mutation notification, manual sync)
 * and dispatches sync requests to the sync engine without duplicate runs.
 */

import { syncEngine } from './syncEngine.js';
import syncState from './syncState.js';
import outboxRepository from '../db/repositories/outboxRepository.js';
import { MUTATION_STATUS } from '../db/schema.js';

let initialized = false;
let mutationDebounceTimer = null;

export const syncManager = {
  /**
   * Initialize browser event listeners and trigger startup synchronization if online.
   */
  init() {
    if (initialized) return;
    initialized = true;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        syncState.setOnlineStatus(true);
        this.triggerSync('online-event');
      });

      window.addEventListener('offline', () => {
        syncState.setOnlineStatus(false);
      });

      // Startup synchronization if online
      const isOnline = (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean')
        ? navigator.onLine
        : true;

      if (isOnline) {
        syncState.setOnlineStatus(true);
        this.triggerSync('startup');
      } else {
        syncState.setOnlineStatus(false);
      }
    }
  },

  /**
   * Request synchronization from any trigger source.
   */
  async triggerSync(source = 'manual') {
    const isOnline = (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean')
      ? navigator.onLine
      : true;

    if (!isOnline) {
      syncState.setOnlineStatus(false);
      return { skipped: true, reason: 'OFFLINE' };
    }

    try {
      return await syncEngine.sync({ source });
    } catch (err) {
      console.warn(`[SyncManager] Sync triggered by ${source} completed with error:`, err.message);
      return { failed: true, error: err.message };
    }
  },

  /**
   * Called by local repositories after committing an atomic outbox mutation.
   * Debounces consecutive writes and dispatches a background sync if online.
   */
  notifyMutationCreated() {
    const isOnline = (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean')
      ? navigator.onLine
      : true;

    if (!isOnline) {
      return;
    }

    if (mutationDebounceTimer) {
      clearTimeout(mutationDebounceTimer);
    }

    // Small debounce (50ms) to allow rapid local batching without multiple sync runs
    mutationDebounceTimer = setTimeout(() => {
      mutationDebounceTimer = null;
      this.triggerSync('local-mutation');
    }, 50);
  },

  /**
   * Manual Sync Now action invoked from the Sync Center UI.
   */
  async triggerManualSync() {
    return await this.triggerSync('manual-ui');
  },

  /**
   * Reset a failed mutation back to PENDING and trigger synchronization if online.
   */
  async retryMutation(id) {
    await outboxRepository.updateMutationStatus(id, MUTATION_STATUS.PENDING, {
      attempt_count: 0,
      last_error: null
    });

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      return await this.triggerSync('manual-retry');
    }
    return { status: 'RESET_TO_PENDING' };
  }
};

export default syncManager;
