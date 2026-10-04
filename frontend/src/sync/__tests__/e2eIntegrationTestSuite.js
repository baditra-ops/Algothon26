import 'fake-indexeddb/auto';
import { db } from '../../db/database.js';
import { SYNC_STATUS, TASK_STATUS, TASK_PRIORITY, MUTATION_STATUS } from '../../db/schema.js';
import projectRepository from '../../db/repositories/projectRepository.js';
import taskRepository from '../../db/repositories/taskRepository.js';
import outboxRepository from '../../db/repositories/outboxRepository.js';
import conflictRepository from '../../db/repositories/conflictRepository.js';
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

async function runE2ETests() {
  console.log('\n======================================================');
  console.log('FIELDNOTE End-to-End Integration Verification Suite (Prompt 8)');
  console.log('======================================================\n');

  // Clear database
  await clearLocalDatabase();

  // ------------------------------------------------------------------------
  // INTEGRATION FLOW 1: Local Create -> Outbox -> Sync -> Server -> Local SYNCED
  // ------------------------------------------------------------------------
  console.log('1. Flow 1: Local Create -> Outbox -> Sync -> Server -> Local SYNCED');
  clearMocks();

  // Server state mock
  let serverProjects = [];
  let serverTasks = [];

  let p1;
  let t1;

  registerMock('POST', '/api/projects', async (url, opts) => {
    const body = JSON.parse(opts.body);
    const created = {
      id: p1?.id || 'server-p1-id',
      name: body.name,
      description: body.description || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    serverProjects.push(created);
    return jsonResponse(created, 201);
  });

  registerMock('POST', '/api/tasks', async (url, opts) => {
    const body = JSON.parse(opts.body);
    const created = {
      id: t1?.id || 'server-task-id',
      project_id: body.project_id,
      title: body.title,
      description: body.description || '',
      status: body.status || 'TODO',
      priority: body.priority || 'MEDIUM',
      due_date: body.due_date || null,
      version: 1, // Server sets version = 1
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    serverTasks.push(created);
    return jsonResponse(created, 201);
  });

  registerMock('GET', '/api/projects', () => jsonResponse(serverProjects));
  registerMock('GET', '/api/tasks', () => jsonResponse(serverTasks));

  // Step 1: User creates project & task locally
  p1 = await projectRepository.createProject({
    name: 'Wind Substation Grid Alpha',
    description: 'Offshore turbine electrical grid diagnostic'
  });
  assert(p1.sync_status === SYNC_STATUS.PENDING_CREATE, 'Project created with PENDING_CREATE');

  t1 = await taskRepository.createTask({
    project_id: p1.id,
    title: 'Inspect High-Voltage Busbars',
    description: 'Check composite stress and insulation resistance',
    status: TASK_STATUS.TODO,
    priority: TASK_PRIORITY.HIGH
  });
  assert(t1.sync_status === SYNC_STATUS.PENDING_CREATE, 'Task created with PENDING_CREATE');
  assert(t1.version === 0, 'Local task initialized with version = 0');

  // Verify outbox entries
  const outboxBefore = await outboxRepository.getPendingMutations();
  assert(outboxBefore.length === 2, '2 pending mutations queued in outbox');

  // Step 2: Trigger synchronization engine
  const syncSummary1 = await syncEngine.sync();
  assert(syncSummary1.succeeded === 2, 'Sync engine succeeded on both mutations');

  // Step 3: Verify local records updated to server authoritative values
  const p1Synced = await db.projects.get(p1.id);
  assert(p1Synced.sync_status === SYNC_STATUS.SYNCED, 'Project transitioned to SYNCED in IndexedDB');
  assert(p1Synced.last_synced_at !== null, 'Project recorded last_synced_at timestamp');

  const t1Synced = await db.tasks.get(t1.id);
  assert(t1Synced.sync_status === SYNC_STATUS.SYNCED, 'Task transitioned to SYNCED in IndexedDB');
  assert(t1Synced.version === 1, 'Task version updated from 0 to authoritative server version 1');

  // Outbox entries completed
  const pendingOutboxAfter = await outboxRepository.getPendingMutations();
  assert(pendingOutboxAfter.length === 0, 'Outbox queue has 0 pending mutations remaining');

  // ------------------------------------------------------------------------
  // INTEGRATION FLOW 2: Offline Edit -> Server Changed Elsewhere -> 409 Conflict
  //                     -> Keep Local -> New Mutation -> Sync -> Server Success
  // ------------------------------------------------------------------------
  console.log('\n2. Flow 2: Offline Edit -> 409 Conflict -> Keep Local -> Sync Success');
  clearMocks();

  // Task is at version 1.
  // Device B concurrently updates task on server to version 2:
  let serverTaskV2 = {
    id: t1.id,
    project_id: p1.id,
    title: 'Inspect High-Voltage Busbars (Remote Team Edit)',
    description: 'Updated by cloud operator',
    status: TASK_STATUS.IN_PROGRESS,
    priority: TASK_PRIORITY.MEDIUM,
    version: 2,
    created_at: t1.created_at,
    updated_at: new Date().toISOString()
  };

  // Device A is offline and edits task with offline notes
  await taskRepository.updateTask(t1.id, {
    title: 'Inspect High-Voltage Busbars (Field Inspection Complete)',
    status: TASK_STATUS.COMPLETED
  });

  const localEditedTask = await db.tasks.get(t1.id);
  assert(localEditedTask.sync_status === SYNC_STATUS.PENDING_UPDATE, 'Local task marked PENDING_UPDATE');

  // Server PUT will reject stale base_version 1 with HTTP 409
  registerMock('PUT', `/api/tasks/${t1.id}`, (url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.version === 1) {
      return jsonResponse(
        {
          error: 'VERSION_CONFLICT',
          message: 'The task has been modified on the server.',
          serverTask: serverTaskV2
        },
        409
      );
    }
    // Once resolved with base_version 2:
    if (body.version === 2) {
      const updated = {
        ...serverTaskV2,
        title: body.title,
        status: body.status,
        version: 3, // Increments to 3
        updated_at: new Date().toISOString()
      };
      serverTaskV2 = updated;
      return jsonResponse(updated, 200);
    }
    return jsonResponse({ error: 'Unexpected version' }, 400);
  });
  registerMock('GET', '/api/projects', () => jsonResponse(serverProjects));
  registerMock('GET', '/api/tasks', () => jsonResponse([serverTaskV2]));

  // Device A syncs: encounters 409
  const sync409Result = await syncEngine.sync();
  assert(sync409Result.conflicts === 1, 'Sync engine captured 1 HTTP 409 conflict');

  // Verify task and conflict state
  const conflictedTask = await db.tasks.get(t1.id);
  assert(conflictedTask.sync_status === SYNC_STATUS.CONFLICT, 'Task marked sync_status = CONFLICT');

  const pendingConflicts = await conflictRepository.getPendingConflicts();
  assert(pendingConflicts.length === 1, 'Persistent conflict record exists in db.conflicts');
  const activeConflict = pendingConflicts[0];
  assert(activeConflict.base_version === 1, 'Conflict captured local base_version = 1');
  assert(activeConflict.server_version === 2, 'Conflict captured server_version = 2');

  // User chooses "Keep Local"
  const resolveResult = await conflictRepository.resolveConflict(activeConflict.id, 'KEEP_LOCAL');
  assert(resolveResult.success === true, 'Conflict resolved with KEEP_LOCAL');

  // Verify task updated with server_version (2) as new optimistic base
  const taskAfterKeepLocal = await db.tasks.get(t1.id);
  assert(taskAfterKeepLocal.version === 2, 'Task updated with base_version = 2');
  assert(taskAfterKeepLocal.sync_status === SYNC_STATUS.PENDING_UPDATE, 'Task sync_status = PENDING_UPDATE');

  // Verify old mutation was removed and new mutation queued
  const pendingOutboxAfterRes = await outboxRepository.getPendingMutations();
  assert(pendingOutboxAfterRes.length === 1, 'Exactly 1 pending outbox mutation queued after resolution');
  assert(pendingOutboxAfterRes[0].base_version === 2, 'New mutation uses server_version 2 as base');

  // Now trigger sync: server accepts version 2 and returns version 3
  const resolvedSyncResult = await syncEngine.sync();
  assert(resolvedSyncResult.succeeded === 1, 'Sync engine successfully reconciled resolved mutation');

  const finalTask = await db.tasks.get(t1.id);
  assert(finalTask.version === 3, 'Final task adopted server version 3');
  assert(finalTask.sync_status === SYNC_STATUS.SYNCED, 'Final task restored to SYNCED');

  const finalConflicts = await conflictRepository.getPendingConflicts();
  assert(finalConflicts.length === 0, 'Zero pending conflicts remaining');

  // ------------------------------------------------------------------------
  // INTEGRATION FLOW 3: Offline Create -> Reload -> Exists -> Online Reconnect -> Sync
  // ------------------------------------------------------------------------
  console.log('\n3. Flow 3: Offline Create -> Reload Persistence -> Online Sync');
  clearMocks();

  // Set offline
  Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });
  syncState.setOnlineStatus(false);

  // Create project offline
  const offlineProject = await projectRepository.createProject({
    id: 'proj-offline-persistent',
    name: 'Coastal Offshore Turbine 7',
    description: 'Sub-sea cable stability review'
  });
  assert(offlineProject.sync_status === SYNC_STATUS.PENDING_CREATE, 'Offline project created in IndexedDB');

  // Simulate Page Reload: verify IndexedDB persistence directly
  const reloadedProject = await db.projects.get('proj-offline-persistent');
  assert(reloadedProject !== null, 'Offline project survived simulated reload in IndexedDB');
  assert(reloadedProject.name === 'Coastal Offshore Turbine 7', 'Project name preserved intact');

  const reloadedOutbox = await db.outbox
    .where('[entity_type+entity_id]')
    .equals(['project', 'proj-offline-persistent'])
    .first();
  assert(reloadedOutbox !== null, 'Outbox mutation survived simulated reload');
  assert(reloadedOutbox.status === MUTATION_STATUS.PENDING, 'Outbox mutation remains PENDING');

  // Now reconnect to network
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  syncState.setOnlineStatus(true);

  registerMock('POST', '/api/projects', async (url, opts) => {
    const body = JSON.parse(opts.body);
    return jsonResponse({
      id: 'proj-offline-persistent',
      name: body.name,
      description: body.description,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, 201);
  });
  registerMock('GET', '/api/projects', () => jsonResponse([]));
  registerMock('GET', '/api/tasks', () => jsonResponse([]));

  // Sync executes
  const postReconnectSync = await syncEngine.sync();
  assert(postReconnectSync.succeeded >= 1, 'Sync engine transmitted offline project upon reconnection');

  const finalSyncedOfflineProj = await db.projects.get('proj-offline-persistent');
  assert(finalSyncedOfflineProj.sync_status === SYNC_STATUS.SYNCED, 'Offline project transitioned to SYNCED');

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

runE2ETests().catch((err) => {
  console.error('End-to-End integration test suite failed:', err);
  process.exit(1);
});
