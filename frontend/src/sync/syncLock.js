/**
 * Single Synchronization Lock
 * Ensures only one synchronization process owns the queue at any given time.
 * Prevents race conditions and duplicate API transmissions.
 */

let isLocked = false;
let currentSyncPromise = null;

export const syncLock = {
  /**
   * Check if a synchronization cycle is currently active.
   */
  isSyncing() {
    return isLocked;
  },

  /**
   * Retrieve the in-flight synchronization Promise, if any.
   */
  getCurrentPromise() {
    return currentSyncPromise;
  },

  /**
   * Attempt to acquire the sync lock.
   * Returns true if lock was acquired, false if already locked.
   */
  acquire() {
    if (isLocked) {
      return false;
    }
    isLocked = true;
    return true;
  },

  /**
   * Set the active Promise associated with the current lock.
   */
  setPromise(promise) {
    currentSyncPromise = promise;
  },

  /**
   * Release the sync lock, resetting state for subsequent runs.
   * Guarantees release even on catastrophic failures.
   */
  release() {
    isLocked = false;
    currentSyncPromise = null;
  },

  /**
   * Execute an async synchronization action with guaranteed lock acquisition and release.
   */
  async runWithLock(action) {
    if (!this.acquire()) {
      // Return existing in-flight sync promise if available
      if (currentSyncPromise) {
        return await currentSyncPromise;
      }
      return { skipped: true, reason: 'LOCKED' };
    }

    try {
      const promise = action();
      this.setPromise(promise);
      return await promise;
    } finally {
      this.release();
    }
  }
};

export default syncLock;
