/**
 * Sync Engine Orchestrator
 * Coordinates mutation queue playback, server data pull reconciliation,
 * conflict tracking, and synchronization lock enforcement.
 */

import db from '../db/database.js';
import outboxRepository from '../db/repositories/outboxRepository.js';
import syncState, { SYNC_STATE } from './syncState.js';
import syncLock from './syncLock.js';
import { processMutation } from './mutationProcessor.js';
import pullService from './pullService.js';

/**
 * Sort mutations deterministically:
 * Ensures parent project CREATE precedes child task CREATE.
 */
export function sortMutations(mutations) {
  return [...mutations].sort((a, b) => {
    // Project CREATE must always precede Task CREATE referencing that project
    if (
      a.entity_type === 'project' &&
      a.operation === 'CREATE' &&
      b.entity_type === 'task' &&
      b.operation === 'CREATE' &&
      b.payload?.project_id === a.entity_id
    ) {
      return -1;
    }
    if (
      b.entity_type === 'project' &&
      b.operation === 'CREATE' &&
      a.entity_type === 'task' &&
      a.operation === 'CREATE' &&
      a.payload?.project_id === b.entity_id
    ) {
      return 1;
    }

    // Otherwise maintain strict FIFO order
    return new Date(a.created_at) - new Date(b.created_at);
  });
}

export const syncEngine = {
  /**
   * Execute a full synchronization cycle:
   * 1. Validate connectivity
   * 2. Process pending outbox mutations
   * 3. Pull authoritative server state
   * 4. Update sync state telemetry
   */
  async sync(options = {}) {
    const stateObj = syncState.getState();
    const isOnline = stateObj.isOnline && ((typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') ? navigator.onLine : true);

    if (!isOnline) {
      syncState.setOnlineStatus(false);
      return { skipped: true, reason: 'OFFLINE' };
    }

    return await syncLock.runWithLock(async () => {
      syncState.setState({ state: SYNC_STATE.SYNCING, lastError: null });

      const summary = {
        processed: 0,
        succeeded: 0,
        failed: 0,
        conflicts: 0,
        retried: 0,
        skipped: 0
      };

      try {
        // Step 1: Query and sort pending mutations
        const pending = await outboxRepository.getPendingMutations();
        const sorted = sortMutations(pending);

        // Step 2: Process mutations sequentially with error isolation
        for (const mut of sorted) {
          // Check for mid-cycle network drop
          const isStillConnected = (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean')
            ? navigator.onLine
            : true;

          if (!isStillConnected) {
            syncState.setOnlineStatus(false);
            summary.skipped += sorted.length - summary.processed;
            break;
          }

          summary.processed++;
          try {
            const result = await processMutation(mut);

            if (result.status === 'COMPLETED') {
              summary.succeeded++;
            } else if (result.status === 'CONFLICT') {
              summary.conflicts++;
            } else if (result.status === 'RETRY') {
              summary.retried++;
            } else if (result.status === 'FAILED') {
              summary.failed++;
            }
          } catch (itemErr) {
            console.error(`[SyncEngine] Unhandled mutation error for ${mut.id}:`, itemErr);
            summary.failed++;
          }
        }

        // Step 3: Pull authoritative central data if still online
        const isStillOnline = (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean')
          ? navigator.onLine
          : true;
        if (isStillOnline) {
          try {
            await pullService.pullServerData();
          } catch (pullErr) {
            console.error('[SyncEngine] Pull service encountered an error:', pullErr);
            // Non-fatal to local outbox processing, but log error
            syncState.setState({ lastError: `Pull sync error: ${pullErr.message}` });
          }
        }

        // Step 4: Refresh telemetry and final status
        const outboxStats = await outboxRepository.getOutboxStats();
        let conflictCount = 0;
        try {
          conflictCount = await db.conflicts.where('status').equals('PENDING').count();
        } catch {
          // db.conflicts fallback
          conflictCount = outboxStats.conflicts || 0;
        }

        const now = new Date().toISOString();
        let finalState = SYNC_STATE.IDLE;

        if (summary.conflicts > 0 || conflictCount > 0) {
          finalState = SYNC_STATE.CONFLICT;
        } else if (summary.failed > 0 || outboxStats.failed > 0) {
          finalState = SYNC_STATE.ERROR;
        }

        syncState.setState({
          state: finalState,
          lastSyncAt: now,
          lastSummary: summary,
          stats: {
            pending: outboxStats.pending,
            processing: outboxStats.processing,
            failed: outboxStats.failed,
            conflicts: conflictCount,
            completed: outboxStats.completed
          }
        });

        return summary;
      } catch (fatalErr) {
        console.error('[SyncEngine] Fatal synchronization error:', fatalErr);
        syncState.setState({
          state: SYNC_STATE.ERROR,
          lastError: fatalErr.message || 'Sync failed unexpectedly'
        });
        throw fatalErr;
      }
    });
  }
};

export default syncEngine;
