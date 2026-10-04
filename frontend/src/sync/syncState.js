/**
 * FIELDNOTE Synchronization State Management
 * Maintains lightweight reactive sync status, error, and telemetry metrics.
 */

export const SYNC_STATE = {
  IDLE: 'IDLE',
  SYNCING: 'SYNCING',
  OFFLINE: 'OFFLINE',
  ERROR: 'ERROR',
  CONFLICT: 'CONFLICT'
};

class SyncStateManager {
  constructor() {
    const isOnline = (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean')
      ? navigator.onLine
      : true;
    this.current = {
      state: isOnline ? SYNC_STATE.IDLE : SYNC_STATE.OFFLINE,
      isOnline,
      lastSyncAt: null,
      lastError: null,
      lastSummary: {
        processed: 0,
        succeeded: 0,
        failed: 0,
        conflicts: 0,
        skipped: 0
      },
      stats: {
        pending: 0,
        processing: 0,
        failed: 0,
        conflicts: 0,
        completed: 0
      }
    };
    this.listeners = new Set();
  }

  getState() {
    return { ...this.current };
  }

  setState(updates) {
    this.current = {
      ...this.current,
      ...updates
    };
    this.notify();
  }

  setOnlineStatus(isOnline) {
    const nextState = !isOnline
      ? SYNC_STATE.OFFLINE
      : this.current.state === SYNC_STATE.OFFLINE
        ? SYNC_STATE.IDLE
        : this.current.state;

    this.setState({ isOnline, state: nextState });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify() {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('[SyncState] Listener notification error:', err);
      }
    }
  }
}

export const syncState = new SyncStateManager();
export default syncState;
