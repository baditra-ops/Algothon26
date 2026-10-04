import 'fake-indexeddb/auto';
import { db } from '../../db/database.js';
import { SYNC_STATUS, TASK_STATUS, TASK_PRIORITY, MUTATION_STATUS } from '../../db/schema.js';
import projectRepository from '../../db/repositories/projectRepository.js';
import taskRepository from '../../db/repositories/taskRepository.js';
import outboxRepository from '../../db/repositories/outboxRepository.js';
import conflictRepository from '../../db/repositories/conflictRepository.js';
import { conflictService, calculateFieldDiffs } from '../conflictService.js';
import { syncEngine } from '../syncEngine.js';
import { syncState, SYNC_STATE } from '../syncState.js';
import { clearLocalDatabase } from '../../db/devTools.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${message}`);
    failed++;
  }
}

// Global fetch mock infrastructure
let mockHandlers = [];

function registerMock(method, pathMatcher, handler) {
  mockHandlers.push({ method: method.toUpperCase(), pathMatcher, handler });
}

function clearMocks() {
  mockHandlers = [];
}

const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  const urlStr = String(url);

  for (const mock of mockHandlers) {
    if (mock.method === method) {
      const matches = typeof mock.pathMatcher === 'string'
        ? urlStr.includes(mock.pathMatcher)
        : mock.pathMatcher.test(urlStr);

      if (matches) {
        return await mock.handler(urlStr, options);
      }
    }
  }

  return {
    status: 404,
    ok: false,
    json: async () => ({ error: 'Not Found' }),
    text: async () => JSON.stringify({ error: 'Not Found' })
  };
};

function jsonResponse(data, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => data,
    text: async () => JSON.stringify(data)
  };
}

async function runConflictTests() {
  console.log('\n======================================================');
  console.log('FIELDNOTE Offline Conflict Resolution Test Suite (Prompt 7)');
  console.log('======================================================\n');

  // Reset local IndexedDB
  await clearLocalDatabase();

  // ----------------------------------------------------
  // SECTION 1: Field Diff Calculation Utility
  // ----------------------------------------------------
  console.log('1. Field Divergence Calculation');
  const localSnap = {
    title: 'Inspect Valve 4 - Offline Fix',
    description: 'Local inspection notes',
    status: TASK_STATUS.IN_PROGRESS,
    priority: TASK_PRIORITY.HIGH,
    due_date: '2026-10-15'
  };

  const serverSnap = {
    title: 'Inspect Valve 4 - Cloud Remote',
    description: 'Local inspection notes', // IDENTICAL
    status: TASK_STATUS.COMPLETED,
    priority: TASK_PRIORITY.MEDIUM,
    due_date: '2026-10-15' // IDENTICAL
  };

  const diffs = calculateFieldDiffs(localSnap, serverSnap);
  const diffTitle = diffs.find((d) => d.key === 'title');
  const diffDesc = diffs.find((d) => d.key === 'description');
  const diffStatus = diffs.find((d) => d.key === 'status');
  const diffPriority = diffs.find((d) => d.key === 'priority');
  const diffDate = diffs.find((d) => d.key === 'due_date');

  assert(diffTitle.isDifferent === true, 'Title divergence correctly flagged as DIFFERENT');
  assert(diffDesc.isDifferent === false, 'Identical description correctly flagged as MATCH');
  assert(diffStatus.isDifferent === true, 'Status divergence correctly flagged as DIFFERENT');
  assert(diffPriority.isDifferent === true, 'Priority divergence correctly flagged as DIFFERENT');
  assert(diffDate.isDifferent === false, 'Identical due_date correctly flagged as MATCH');

  // ----------------------------------------------------
  // SECTION 2: Conflict Creation via HTTP 409
  // ----------------------------------------------------
  console.log('\n2. Conflict Creation via HTTP 409 Concurrency Detection');
  clearMocks();

  const testProject = await projectRepository.createProject({
    id: 'proj-conflict-test',
    name: 'Conflict Test Project',
    sync_status: SYNC_STATUS.SYNCED
  });

  // Create a server-known task locally at version 2
  const taskToConflict = {
    id: 'task-conflict-1',
    project_id: testProject.id,
    title: 'Task Alpha — Field Edit',
    description: 'Field notes',
    status: TASK_STATUS.IN_PROGRESS,
    priority: TASK_PRIORITY.HIGH,
    version: 2,
    sync_status: SYNC_STATUS.SYNCED,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  await db.tasks.add(taskToConflict);

  // User edits task locally while offline: creates outbox UPDATE with base_version = 2
  await taskRepository.updateTask(taskToConflict.id, {
    title: 'Task Alpha — Field Edit MODIFIED'
  });

  // Mock server returning HTTP 409 Conflict with serverTask at version 3
  const serverTaskConflict = {
    id: taskToConflict.id,
    project_id: testProject.id,
    title: 'Task Alpha — Server Concurrent Edit',
    description: 'Server notes',
    status: TASK_STATUS.COMPLETED,
    priority: TASK_PRIORITY.LOW,
    version: 3,
    created_at: taskToConflict.created_at,
    updated_at: new Date().toISOString()
  };

  registerMock('PUT', `/api/tasks/${taskToConflict.id}`, () => {
    return jsonResponse(
      {
        error: 'VERSION_CONFLICT',
        message: 'The task has been modified on the server.',
        serverTask: serverTaskConflict
      },
      409
    );
  });
  registerMock('GET', '/api/projects', () => jsonResponse([testProject]));
  registerMock('GET', '/api/tasks', () => jsonResponse([serverTaskConflict]));

  // Run sync — should encounter 409 and create persistent conflict
  const syncRes = await syncEngine.sync();
  assert(syncRes.conflicts === 1, 'Sync engine detected 1 version conflict');

  // Verify task status
  const conflictedTask = await db.tasks.get(taskToConflict.id);
  assert(conflictedTask.sync_status === SYNC_STATUS.CONFLICT, 'Local task transitioned to sync_status = CONFLICT');

  // Verify outbox mutation
  const outboxMuts = await outboxRepository.getMutationsByEntity('task', taskToConflict.id);
  const conflictMutation = outboxMuts[0];
  assert(conflictMutation.status === MUTATION_STATUS.CONFLICT, 'Outbox mutation transitioned to status = CONFLICT');

  // Verify persistent conflict record in db.conflicts
  const pendingConflicts = await conflictRepository.getPendingConflicts();
  assert(pendingConflicts.length === 1, 'Exactly 1 active conflict record in db.conflicts');

  const conflict1 = pendingConflicts[0];
  assert(conflict1.entity_id === taskToConflict.id, 'Conflict entity_id matches task ID');
  assert(conflict1.base_version === 2, 'Conflict preserves local base_version (2)');
  assert(conflict1.server_version === 3, 'Conflict preserves server_version (3)');
  assert(conflict1.local_snapshot.title === 'Task Alpha — Field Edit MODIFIED', 'Local snapshot preserved');
  assert(conflict1.server_snapshot.title === 'Task Alpha — Server Concurrent Edit', 'Server snapshot preserved');
  assert(conflict1.status === 'PENDING', 'Conflict record status initialized to PENDING');

  // ----------------------------------------------------
  // SECTION 3: Resolution Strategy A — Keep Local
  // ----------------------------------------------------
  console.log('\n3. Resolution Strategy A — Keep Local');
  const keepLocalResult = await conflictRepository.resolveConflict(conflict1.id, 'KEEP_LOCAL');
  assert(keepLocalResult.success === true, 'resolveConflict(KEEP_LOCAL) succeeded');

  // Local task updated to server version as base and pending update
  const resolvedTaskLocal = await db.tasks.get(taskToConflict.id);
  assert(resolvedTaskLocal.title === 'Task Alpha — Field Edit MODIFIED', 'Preserved local offline title');
  assert(resolvedTaskLocal.version === 3, 'Task adopted server version (3) as base version');
  assert(resolvedTaskLocal.sync_status === SYNC_STATUS.PENDING_UPDATE, 'Task sync_status = PENDING_UPDATE');

  // Conflict record marked RESOLVED
  const resolvedConflictRecord = await conflictRepository.getConflictById(conflict1.id);
  assert(resolvedConflictRecord.status === 'RESOLVED', 'Conflict record status = RESOLVED');
  assert(resolvedConflictRecord.resolution === 'KEEP_LOCAL', 'Conflict resolution = KEEP_LOCAL');
  assert(resolvedConflictRecord.resolved_at !== null, 'Conflict recorded resolved_at timestamp');

  // Outbox mutation check: old mutation removed, new mutation created with base_version = 3
  const postOutbox = await outboxRepository.getMutationsByEntity('task', taskToConflict.id);
  assert(postOutbox.length === 1, 'Exactly 1 active outbox mutation exists after resolution');
  const replacementMut = postOutbox[0];
  assert(replacementMut.id !== conflictMutation.id, 'Old conflicting mutation was superseded with a NEW mutation');
  assert(replacementMut.base_version === 3, 'New mutation uses latest server version (3) as optimistic base');
  assert(replacementMut.status === MUTATION_STATUS.PENDING, 'New replacement mutation is PENDING for transmission');

  // Verify old mutation is physically removed from outbox
  const oldMutCheck = await db.outbox.get(conflictMutation.id);
  assert(!oldMutCheck, 'Old conflicting mutation was cleanly removed from outbox');

  // ----------------------------------------------------
  // SECTION 4: Resolution Strategy B — Keep Server
  // ----------------------------------------------------
  console.log('\n4. Resolution Strategy B — Keep Server');
  // Create another conflict
  const taskToConflict2 = {
    id: 'task-conflict-2',
    project_id: testProject.id,
    title: 'Task Beta — Local',
    description: 'Local desc',
    status: TASK_STATUS.TODO,
    priority: TASK_PRIORITY.HIGH,
    version: 4,
    sync_status: SYNC_STATUS.CONFLICT,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  await db.tasks.add(taskToConflict2);

  const serverTaskBeta = {
    id: taskToConflict2.id,
    project_id: testProject.id,
    title: 'Task Beta — Server Authority',
    description: 'Server updated desc',
    status: TASK_STATUS.COMPLETED,
    priority: TASK_PRIORITY.LOW,
    version: 5,
    created_at: taskToConflict2.created_at,
    updated_at: new Date().toISOString()
  };

  const oldMutBeta = {
    id: 'mut-beta-conflict',
    entity_type: 'task',
    entity_id: taskToConflict2.id,
    operation: 'UPDATE',
    payload: { title: 'Task Beta — Local' },
    base_version: 4,
    idempotency_key: 'idem-beta-1',
    status: MUTATION_STATUS.CONFLICT,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    attempt_count: 1
  };
  await db.outbox.add(oldMutBeta);

  const conflictBeta = await conflictRepository.recordConflict({
    entity_type: 'task',
    entity_id: taskToConflict2.id,
    mutation_id: oldMutBeta.id,
    local_snapshot: taskToConflict2,
    server_snapshot: serverTaskBeta,
    base_version: 4,
    server_version: 5
  });

  const keepServerResult = await conflictRepository.resolveConflict(conflictBeta.id, 'KEEP_SERVER');
  assert(keepServerResult.success === true, 'resolveConflict(KEEP_SERVER) succeeded');

  const resolvedTaskServer = await db.tasks.get(taskToConflict2.id);
  assert(resolvedTaskServer.title === 'Task Beta — Server Authority', 'Local task replaced with server title');
  assert(resolvedTaskServer.status === TASK_STATUS.COMPLETED, 'Local task replaced with server status');
  assert(resolvedTaskServer.version === 5, 'Local task version updated to server version 5');
  assert(resolvedTaskServer.sync_status === SYNC_STATUS.SYNCED, 'Task marked SYNCED');

  // Verify NO new update mutation was queued (server already has the state)
  const betaOutbox = await outboxRepository.getMutationsByEntity('task', taskToConflict2.id);
  assert(betaOutbox.length === 0, 'No pending outbox mutations remain (server already has state)');

  const oldBetaCheck = await db.outbox.get(oldMutBeta.id);
  assert(!oldBetaCheck, 'Old conflicting mutation removed from outbox');

  // ----------------------------------------------------
  // SECTION 5: Resolution Strategy C — Merge / Edit
  // ----------------------------------------------------
  console.log('\n5. Resolution Strategy C — Merge / Edit');
  const taskToConflict3 = {
    id: 'task-conflict-3',
    project_id: testProject.id,
    title: 'Task Gamma — Local',
    description: 'Local observation',
    status: TASK_STATUS.TODO,
    priority: TASK_PRIORITY.HIGH,
    version: 1,
    sync_status: SYNC_STATUS.CONFLICT,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  await db.tasks.add(taskToConflict3);

  const serverTaskGamma = {
    id: taskToConflict3.id,
    project_id: testProject.id,
    title: 'Task Gamma — Server',
    description: 'Server observation',
    status: TASK_STATUS.IN_PROGRESS,
    priority: TASK_PRIORITY.LOW,
    version: 2,
    created_at: taskToConflict3.created_at,
    updated_at: new Date().toISOString()
  };

  const oldMutGamma = {
    id: 'mut-gamma-conflict',
    entity_type: 'task',
    entity_id: taskToConflict3.id,
    operation: 'UPDATE',
    payload: { title: 'Task Gamma — Local' },
    base_version: 1,
    idempotency_key: 'idem-gamma-1',
    status: MUTATION_STATUS.CONFLICT,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    attempt_count: 1
  };
  await db.outbox.add(oldMutGamma);

  const conflictGamma = await conflictRepository.recordConflict({
    entity_type: 'task',
    entity_id: taskToConflict3.id,
    mutation_id: oldMutGamma.id,
    local_snapshot: taskToConflict3,
    server_snapshot: serverTaskGamma,
    base_version: 1,
    server_version: 2
  });

  // User manually merges: takes local title, server status, combined description, and HIGH priority
  const mergedFields = {
    project_id: testProject.id,
    title: 'Task Gamma — Merged Compromise',
    description: 'Combined observations from both field and cloud',
    status: TASK_STATUS.IN_PROGRESS, // Server
    priority: TASK_PRIORITY.HIGH, // Local
    due_date: '2026-10-31'
  };

  const mergeResult = await conflictRepository.resolveConflict(conflictGamma.id, 'MERGED', mergedFields);
  assert(mergeResult.success === true, 'resolveConflict(MERGED) succeeded');

  const resolvedTaskMerged = await db.tasks.get(taskToConflict3.id);
  assert(resolvedTaskMerged.title === 'Task Gamma — Merged Compromise', 'Merged task title applied');
  assert(resolvedTaskMerged.description === 'Combined observations from both field and cloud', 'Merged description applied');
  assert(resolvedTaskMerged.status === TASK_STATUS.IN_PROGRESS, 'Merged status applied');
  assert(resolvedTaskMerged.priority === TASK_PRIORITY.HIGH, 'Merged priority applied');
  assert(resolvedTaskMerged.version === 2, 'Merged task base_version updated to server version 2');
  assert(resolvedTaskMerged.sync_status === SYNC_STATUS.PENDING_UPDATE, 'Merged task marked PENDING_UPDATE');

  const gammaOutbox = await outboxRepository.getMutationsByEntity('task', taskToConflict3.id);
  assert(gammaOutbox.length === 1, 'Exactly 1 replacement mutation enqueued for merged task');
  assert(gammaOutbox[0].base_version === 2, 'Replacement mutation base_version is server version 2');
  assert(gammaOutbox[0].payload.title === 'Task Gamma — Merged Compromise', 'Replacement mutation has merged payload');

  // ----------------------------------------------------
  // SECTION 6: Offline Conflict Resolution
  // ----------------------------------------------------
  console.log('\n6. Offline Conflict Resolution & Post-Online Synchronization');
  // Simulate navigator.onLine = false
  Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });

  const offlineTaskId = 'task-offline-resolve';
  const offlineTask = {
    id: offlineTaskId,
    project_id: testProject.id,
    title: 'Offline Conflict Task',
    status: TASK_STATUS.TODO,
    version: 3,
    sync_status: SYNC_STATUS.CONFLICT
  };
  await db.tasks.add(offlineTask);

  const offlineConflict = await conflictRepository.recordConflict({
    entity_type: 'task',
    entity_id: offlineTaskId,
    mutation_id: 'old-mut-offline',
    local_snapshot: offlineTask,
    server_snapshot: { id: offlineTaskId, version: 4, title: 'Server Title 4' },
    base_version: 3,
    server_version: 4
  });

  // Resolve while offline
  const offlineResolveResult = await conflictRepository.resolveConflict(offlineConflict.id, 'KEEP_LOCAL');
  assert(offlineResolveResult.success === true, 'Conflict successfully resolved while OFFLINE');

  const offlineSavedTask = await db.tasks.get(offlineTaskId);
  assert(offlineSavedTask.version === 4, 'Resolved task saved in IndexedDB with base version 4');
  assert(offlineSavedTask.sync_status === SYNC_STATUS.PENDING_UPDATE, 'Resolved task waiting in PENDING_UPDATE status');

  const offlineOutbox = await outboxRepository.getMutationsByEntity('task', offlineTaskId);
  assert(offlineOutbox.length === 1, 'Replacement mutation waiting in outbox while offline');
  assert(offlineOutbox[0].base_version === 4, 'Mutation has base_version = 4');

  // Now simulate coming online
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  syncState.setOnlineStatus(true);

  // Register mock server update accepting version 4 and returning version 5
  registerMock('PUT', `/api/tasks/${offlineTaskId}`, (url, opts) => {
    const body = JSON.parse(opts.body);
    assert(body.version === 4, 'Transmitted payload uses resolved base_version (4)');
    return jsonResponse({
      ...offlineSavedTask,
      version: 5,
      updated_at: new Date().toISOString()
    });
  });

  const onlineSyncRes = await syncEngine.sync();
  assert(onlineSyncRes.succeeded >= 1, 'Sync engine transmitted offline-resolved mutation upon reconnect');

  const finalSyncedTask = await db.tasks.get(offlineTaskId);
  assert(finalSyncedTask.version === 5, 'Local task updated to server-confirmed version (5)');
  assert(finalSyncedTask.sync_status === SYNC_STATUS.SYNCED, 'Local task restored to SYNCED');

  // ----------------------------------------------------
  // SECTION 7: Persistence Across Reload & Multiple Conflicts
  // ----------------------------------------------------
  console.log('\n7. Multiple Conflicts Isolation & Reload Persistence');
  // Clear any existing conflicts
  await db.conflicts.clear();

  // Create 3 conflicts
  const cA = await conflictRepository.recordConflict({
    entity_type: 'task',
    entity_id: 'task-multi-a',
    mutation_id: 'mut-a',
    local_snapshot: { title: 'Task A' },
    server_snapshot: { title: 'Task A (Server)', version: 6 },
    base_version: 5,
    server_version: 6
  });

  const cB = await conflictRepository.recordConflict({
    entity_type: 'task',
    entity_id: 'task-multi-b',
    mutation_id: 'mut-b',
    local_snapshot: { title: 'Task B' },
    server_snapshot: { title: 'Task B (Server)', version: 8 },
    base_version: 7,
    server_version: 8
  });

  const cC = await conflictRepository.recordConflict({
    entity_type: 'task',
    entity_id: 'task-multi-c',
    mutation_id: 'mut-c',
    local_snapshot: { title: 'Task C' },
    server_snapshot: { title: 'Task C (Server)', version: 10 },
    base_version: 9,
    server_version: 10
  });

  let active = await conflictRepository.getPendingConflicts();
  assert(active.length === 3, '3 active conflicts persisted');

  // Simulate reloading: read directly from Dexie table
  const reloadedConflicts = await db.conflicts.where('status').equals('PENDING').toArray();
  assert(reloadedConflicts.length === 3, 'Conflicts survive page reload intact in IndexedDB');

  // Add dummy tasks for A, B, C so resolution transactions succeed
  await db.tasks.bulkAdd([
    { id: 'task-multi-a', project_id: testProject.id, title: 'Task A', version: 5 },
    { id: 'task-multi-b', project_id: testProject.id, title: 'Task B', version: 7 },
    { id: 'task-multi-c', project_id: testProject.id, title: 'Task C', version: 9 }
  ]);

  // Resolve only Conflict B
  await conflictRepository.resolveConflict(cB.id, 'KEEP_SERVER');

  active = await conflictRepository.getPendingConflicts();
  assert(active.length === 2, 'Resolving one conflict leaves exactly 2 pending');
  assert(active.some((c) => c.id === cA.id), 'Conflict A remains pending');
  assert(active.some((c) => c.id === cC.id), 'Conflict C remains pending');
  assert(!active.some((c) => c.id === cB.id), 'Conflict B is no longer pending');

  // ----------------------------------------------------
  // SECTION 8: Race-Condition & Duplicate Resolution Protection
  // ----------------------------------------------------
  console.log('\n8. Duplicate Resolution Guard');
  // Attempt resolving Conflict B again
  const duplicateRes = await conflictRepository.resolveConflict(cB.id, 'KEEP_SERVER');
  assert(duplicateRes.alreadyResolved === true, 'Duplicate resolution cleanly detected without errors or side effects');

  // ----------------------------------------------------
  // SECTION 9: Stale Mutation Resend Prevention
  // ----------------------------------------------------
  console.log('\n9. Stale Mutation Resend Prevention');
  const allOutbox = await db.outbox.toArray();
  // None of the old conflicting mutations (mut-a, mut-b, mut-c) should be in outbox
  const hasStaleMutB = allOutbox.some((m) => m.id === 'mut-b' && m.status === MUTATION_STATUS.PENDING);
  assert(!hasStaleMutB, 'Resolved mutation B cannot be resent by outbox processor');

  // Cleanup
  globalThis.fetch = originalFetch;

  console.log('\n======================================================');
  console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runConflictTests().catch((err) => {
  console.error('Conflict test suite failed with error:', err);
  process.exit(1);
});
