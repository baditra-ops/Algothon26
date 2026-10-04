import 'fake-indexeddb/auto';
import { db } from '../../db/database.js';
import { SYNC_STATUS, TASK_STATUS, TASK_PRIORITY, MUTATION_STATUS } from '../../db/schema.js';
import projectRepository from '../../db/repositories/projectRepository.js';
import taskRepository from '../../db/repositories/taskRepository.js';
import outboxRepository from '../../db/repositories/outboxRepository.js';
import { clearLocalDatabase } from '../../db/devTools.js';
import { syncEngine, sortMutations } from '../syncEngine.js';
import { syncManager } from '../syncManager.js';
import { syncState, SYNC_STATE } from '../syncState.js';
import { syncLock } from '../syncLock.js';
import { processMutation, isTransientError } from '../mutationProcessor.js';
import { pullService } from '../pullService.js';

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

  // Default fallback 404
  return {
    status: 404,
    ok: false,
    json: async () => ({ error: 'NOT_FOUND', message: `Mock not found: ${method} ${urlStr}` })
  };
};

function jsonResponse(data, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => data
  };
}

function noContentResponse() {
  return {
    status: 204,
    ok: true,
    json: async () => null
  };
}

async function runSyncTests() {
  console.log('\n======================================================');
  console.log('FIELDNOTE Offline Synchronization Engine Test Suite (Prompt 6)');
  console.log('======================================================\n');

  // Clear local DB and mocks
  await clearLocalDatabase();
  clearMocks();

  // Mock pull endpoints default to empty list
  registerMock('GET', '/api/projects', () => jsonResponse([]));
  registerMock('GET', '/api/tasks', () => jsonResponse([]));

  // ----------------------------------------------------
  // SECTION 1: Basic Outbox Processing (Project CREATE)
  // ----------------------------------------------------
  console.log('1. Project CREATE Outbox Synchronization');
  let projectPostCalled = false;
  let receivedProjectPayload = null;

  registerMock('POST', '/api/projects', async (url, opts) => {
    projectPostCalled = true;
    receivedProjectPayload = JSON.parse(opts.body);
    return jsonResponse({
      id: 'server-proj-uuid-1',
      name: receivedProjectPayload.name,
      description: receivedProjectPayload.description,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, 201);
  });

  const proj1 = await projectRepository.createProject({
    name: 'Offshore Substation Bravo',
    description: 'Transformer array audit'
  });

  const pendingProjMut = await outboxRepository.getMutationsByEntity('project', proj1.id);
  assert(pendingProjMut.length === 1, 'Local project has 1 pending CREATE mutation');

  const syncResult1 = await syncEngine.sync();
  assert(projectPostCalled, 'POST /api/projects was called by sync engine');
  assert(receivedProjectPayload.name === 'Offshore Substation Bravo', 'Correct payload sent to server');
  assert(syncResult1.succeeded === 1, '1 mutation succeeded in sync summary');

  // Verify mutation status transitioned to COMPLETED
  const completedProjMut = await outboxRepository.getMutationById(pendingProjMut[0].id);
  assert(completedProjMut.status === MUTATION_STATUS.COMPLETED, 'CREATE mutation transitioned to COMPLETED');

  // Verify local project is SYNCED
  const updatedLocalProj = await projectRepository.getProjectById(proj1.id) ||
    await projectRepository.getProjectById('server-proj-uuid-1');
  assert(updatedLocalProj !== null, 'Local project record updated');
  assert(updatedLocalProj.sync_status === SYNC_STATUS.SYNCED, 'Local project marked SYNCED');
  assert(updatedLocalProj.last_synced_at !== null, 'last_synced_at timestamp recorded');

  // ----------------------------------------------------
  // SECTION 2: Task CREATE Outbox Synchronization
  // ----------------------------------------------------
  console.log('\n2. Task CREATE Outbox Synchronization');
  const targetProjId = updatedLocalProj.id;
  let taskPostCalled = false;
  let receivedTaskPayload = null;

  registerMock('POST', '/api/tasks', async (url, opts) => {
    taskPostCalled = true;
    receivedTaskPayload = JSON.parse(opts.body);
    return jsonResponse({
      id: 'server-task-uuid-1',
      project_id: receivedTaskPayload.project_id,
      title: receivedTaskPayload.title,
      description: receivedTaskPayload.description,
      status: 'TODO',
      priority: 'HIGH',
      version: 1, // Server assigns version 1
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, 201);
  });

  const task1 = await taskRepository.createTask({
    project_id: targetProjId,
    title: 'Inspect High-Voltage Bushings',
    priority: TASK_PRIORITY.HIGH
  });
  assert(task1.version === 0, 'Local task initialized with version = 0');

  const syncResult2 = await syncEngine.sync();
  assert(taskPostCalled, 'POST /api/tasks was called by sync engine');
  assert(receivedTaskPayload.title === 'Inspect High-Voltage Bushings', 'Task title delivered to server');
  assert(syncResult2.succeeded === 1, 'Task CREATE mutation succeeded');

  const syncdTask = await taskRepository.getTaskById('server-task-uuid-1') ||
    await taskRepository.getTaskById(task1.id);
  assert(syncdTask && syncdTask.version === 1, 'Server version (1) replaced local version (0)');
  assert(syncdTask.sync_status === SYNC_STATUS.SYNCED, 'Task sync_status = SYNCED');

  // ----------------------------------------------------
  // SECTION 3: Task UPDATE with base_version
  // ----------------------------------------------------
  console.log('\n3. Task UPDATE Synchronization with Optimistic Concurrency');
  let taskPutCalled = false;
  let receivedPutPayload = null;

  registerMock('PUT', `/api/tasks/${syncdTask.id}`, async (url, opts) => {
    taskPutCalled = true;
    receivedPutPayload = JSON.parse(opts.body);
    return jsonResponse({
      ...syncdTask,
      status: 'IN_PROGRESS',
      version: 2, // Server increments version
      updated_at: new Date().toISOString()
    }, 200);
  });

  // Local update on synced task
  await taskRepository.updateTask(syncdTask.id, {
    status: TASK_STATUS.IN_PROGRESS
  });

  const syncResult3 = await syncEngine.sync();
  assert(taskPutCalled, 'PUT /api/tasks/:id was called by sync engine');
  assert(receivedPutPayload.version === 1, 'PUT payload sent captured base_version (1)');
  assert(syncResult3.succeeded === 1, 'Task UPDATE succeeded');

  const postUpdateTask = await taskRepository.getTaskById(syncdTask.id);
  assert(postUpdateTask.version === 2, 'Local task updated to server version (2)');
  assert(postUpdateTask.sync_status === SYNC_STATUS.SYNCED, 'Task sync_status returned to SYNCED');

  // ----------------------------------------------------
  // SECTION 4: Server Deletion Synchronization
  // ----------------------------------------------------
  console.log('\n4. Server Deletion Synchronization & Tombstone Cleanup');
  let taskDeleteCalled = false;

  registerMock('DELETE', `/api/tasks/${syncdTask.id}`, async () => {
    taskDeleteCalled = true;
    return noContentResponse();
  });

  await taskRepository.deleteTask(syncdTask.id);
  const tombstone = await taskRepository.getTaskById(syncdTask.id, { includeDeleted: true });
  assert(tombstone && tombstone.sync_status === SYNC_STATUS.PENDING_DELETE, 'Task retained as PENDING_DELETE tombstone');

  const syncResult4 = await syncEngine.sync();
  assert(taskDeleteCalled, 'DELETE /api/tasks/:id was sent to server');
  assert(syncResult4.succeeded === 1, 'Task DELETE mutation completed');

  const tombstoneAfterSync = await taskRepository.getTaskById(syncdTask.id, { includeDeleted: true });
  assert(tombstoneAfterSync === null, 'Tombstone physically purged from IndexedDB upon server confirmation');

  // ----------------------------------------------------
  // SECTION 5: Pull Server State & Shielding Local Edits
  // ----------------------------------------------------
  console.log('\n5. Pulling Server State & Protecting Unsynced Local Records');
  clearMocks();

  const serverProjId = 'server-proj-pull-1';
  const serverTaskId = 'server-task-pull-1';

  registerMock('GET', '/api/projects', () => jsonResponse([
    {
      id: serverProjId,
      name: 'Server Solar Array',
      description: 'Pulled from central database',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ]));

  registerMock('GET', '/api/tasks', () => jsonResponse([
    {
      id: serverTaskId,
      project_id: serverProjId,
      title: 'Inverter Grid Synchronization',
      description: 'Check Phase 1 and 2 frequencies',
      status: 'TODO',
      priority: 'MEDIUM',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ]));

  // Pull into Dexie
  await pullService.pullServerData();

  const pulledProj = await projectRepository.getProjectById(serverProjId);
  const pulledTask = await taskRepository.getTaskById(serverTaskId);
  assert(pulledProj && pulledProj.name === 'Server Solar Array', 'New server project inserted into IndexedDB');
  assert(pulledTask && pulledTask.title === 'Inverter Grid Synchronization', 'New server task inserted into IndexedDB');
  assert(pulledTask.sync_status === SYNC_STATUS.SYNCED, 'Pulled records marked SYNCED');

  // Verify Protection of Unsynced Records
  // Create local records with PENDING_UPDATE and PENDING_CREATE
  const protectedLocalProj = await projectRepository.createProject({
    name: 'Unsynced Local Solar Farm'
  });

  registerMock('GET', '/api/projects', () => jsonResponse([
    {
      id: protectedLocalProj.id,
      name: 'OVERWRITE_ATTEMPT_FROM_SERVER',
      description: 'Should be blocked',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ]));

  await pullService.pullServerData();
  const retainedLocalProj = await projectRepository.getProjectById(protectedLocalProj.id);
  assert(retainedLocalProj.name === 'Unsynced Local Solar Farm', 'Pull PROTECTED local PENDING_CREATE project from being overwritten');
  assert(retainedLocalProj.sync_status === SYNC_STATUS.PENDING_CREATE, 'Preserved local PENDING_CREATE sync_status');

  // ----------------------------------------------------
  // SECTION 6: HTTP 409 Version Conflict Handling
  // ----------------------------------------------------
  console.log('\n6. HTTP 409 Version Conflict Detection & Snapshot Preservation');
  clearMocks();
  registerMock('GET', '/api/projects', () => jsonResponse([]));
  registerMock('GET', '/api/tasks', () => jsonResponse([]));

  // Create a server-known task locally at version = 1
  const conflictTaskId = 'conflict-task-test-id';
  const conflictTask = await taskRepository.createTask({
    id: conflictTaskId,
    project_id: serverProjId,
    title: 'Check Turbine Rotor Flange',
    version: 1,
    sync_status: SYNC_STATUS.SYNCED
  });

  // Client updates task locally (base_version = 1)
  await taskRepository.updateTask(conflictTaskId, {
    status: TASK_STATUS.COMPLETED
  });

  // Server responds with 409 Conflict (server version is already 3)
  const serverConflictSnapshot = {
    id: conflictTaskId,
    project_id: serverProjId,
    title: 'Check Turbine Rotor Flange (Server Version)',
    status: 'IN_PROGRESS',
    version: 3,
    updated_at: new Date().toISOString()
  };

  registerMock('PUT', `/api/tasks/${conflictTaskId}`, async () => {
    return {
      status: 409,
      ok: false,
      json: async () => ({
        error: 'VERSION_CONFLICT',
        message: 'Task was modified on the server',
        serverTask: serverConflictSnapshot
      })
    };
  });

  const syncResultConflict = await syncEngine.sync();
  assert(syncResultConflict.conflicts === 1, 'Sync engine detected 1 version conflict');

  // Local task must become CONFLICT
  const taskInConflict = await taskRepository.getTaskById(conflictTaskId);
  assert(taskInConflict && taskInConflict.sync_status === SYNC_STATUS.CONFLICT, 'Local task marked sync_status = CONFLICT');

  // Mutation must become CONFLICT and NOT COMPLETED
  const conflictMutations = await outboxRepository.getMutationsByEntity('task', conflictTaskId);
  assert(conflictMutations[0].status === MUTATION_STATUS.CONFLICT, 'Outbox mutation marked CONFLICT');

  // Persistent conflict record in db.conflicts
  const persistentConflict = await db.conflicts.where('entity_id').equals(conflictTaskId).first();
  assert(persistentConflict !== undefined, 'Conflict snapshot persisted in db.conflicts table');
  assert(persistentConflict.server_version === 3, 'Persisted conflict contains server_version (3)');
  assert(persistentConflict.base_version === 1, 'Persisted conflict contains local base_version (1)');
  assert(persistentConflict.server_snapshot.title === 'Check Turbine Rotor Flange (Server Version)', 'Server snapshot safely preserved');

  // Sync state must reflect CONFLICT
  assert(syncState.getState().state === SYNC_STATE.CONFLICT, 'Global sync state updated to CONFLICT');

  // ----------------------------------------------------
  // SECTION 7: Retry Logic (Transient vs Non-Transient)
  // ----------------------------------------------------
  console.log('\n7. Bounded Retries for Transient Failures');
  clearMocks();
  registerMock('GET', '/api/projects', () => jsonResponse([]));
  registerMock('GET', '/api/tasks', () => jsonResponse([]));

  // Transient 503 error
  let attemptCount = 0;
  registerMock('POST', '/api/projects', async () => {
    attemptCount++;
    return jsonResponse({ error: 'SERVICE_UNAVAILABLE', message: 'Database temporarily unavailable' }, 503);
  });

  const retryProj = await projectRepository.createProject({
    name: 'Temporary Offline Substation'
  });

  // Run sync — should encounter 503 and schedule retry
  const retrySyncResult = await syncEngine.sync();
  assert(attemptCount === 1, 'First attempt made to server');
  assert(retrySyncResult.retried === 1, 'Mutation marked for retry');

  const retriedMutation = (await outboxRepository.getMutationsByEntity('project', retryProj.id))[0];
  assert(retriedMutation.status === MUTATION_STATUS.PENDING, 'Transient error left mutation in PENDING status');
  assert(retriedMutation.attempt_count === 1, 'attempt_count persisted as 1');

  // ----------------------------------------------------
  // SECTION 8: Single Sync Lock & Concurrency Prevention
  // ----------------------------------------------------
  console.log('\n8. Single Sync Lock Enforcement');
  clearMocks();
  await db.outbox.clear();
  registerMock('GET', '/api/projects', () => jsonResponse([]));
  registerMock('GET', '/api/tasks', () => jsonResponse([]));

  let concurrentCallsCount = 0;
  registerMock('POST', '/api/projects', async () => {
    concurrentCallsCount++;
    // Artificial latency to test concurrency lock
    await new Promise((r) => setTimeout(r, 80));
    return jsonResponse({ id: 'concurrent-p-1', name: 'Lock Test' }, 201);
  });

  await projectRepository.createProject({ name: 'Concurrency Lock Project' });

  // Fire two sync calls simultaneously
  const syncPromise1 = syncEngine.sync();
  const syncPromise2 = syncEngine.sync();

  const [res1, res2] = await Promise.all([syncPromise1, syncPromise2]);
  assert(concurrentCallsCount === 1, 'Only ONE transmission occurred: second call joined or safely yielded');
  assert(!syncLock.isSyncing(), 'Lock was cleanly released after sync execution');

  // ----------------------------------------------------
  // SECTION 9: Offline State Shield
  // ----------------------------------------------------
  console.log('\n9. Offline Connectivity Guard');
  // Simulate navigator.onLine = false
  const origOnLine = Object.getOwnPropertyDescriptor(globalThis.navigator, 'onLine');
  Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });

  const offlineSyncResult = await syncEngine.sync();
  assert(offlineSyncResult.skipped === true && offlineSyncResult.reason === 'OFFLINE', 'Sync safely skipped while offline');
  assert(syncState.getState().state === SYNC_STATE.OFFLINE, 'Sync state reflects OFFLINE');

  // Restore online
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  syncState.setOnlineStatus(true);
  assert(syncState.getState().state === SYNC_STATE.IDLE, 'State restored to IDLE when online');

  // ----------------------------------------------------
  // SECTION 10: Mutation Ordering Dependency
  // ----------------------------------------------------
  console.log('\n10. Mutation Ordering Dependency (Project CREATE before Task CREATE)');
  const unsortedMutations = [
    {
      id: 'mut-task-create',
      entity_type: 'task',
      operation: 'CREATE',
      payload: { project_id: 'parent-proj-uuid', title: 'Child Task' },
      created_at: '2026-10-04T12:00:05.000Z'
    },
    {
      id: 'mut-proj-create',
      entity_type: 'project',
      operation: 'CREATE',
      entity_id: 'parent-proj-uuid',
      payload: { name: 'Parent Project' },
      created_at: '2026-10-04T12:00:10.000Z' // Later timestamp!
    }
  ];

  const sortedMutations = sortMutations(unsortedMutations);
  assert(sortedMutations[0].entity_type === 'project', 'Parent Project CREATE ordered BEFORE Child Task CREATE');

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

runSyncTests().catch((err) => {
  console.error('Sync test suite failed:', err);
  process.exit(1);
});
