import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { db } from '../database.js';
import {
  SYNC_STATUS,
  TASK_STATUS,
  TASK_PRIORITY,
  ENTITY_TYPE,
  MUTATION_OPERATION,
  MUTATION_STATUS,
  STORES_V1,
  STORES_V2
} from '../schema.js';
import { projectRepository } from '../repositories/projectRepository.js';
import { taskRepository } from '../repositories/taskRepository.js';
import { outboxRepository } from '../repositories/outboxRepository.js';
import {
  getLocalDatabaseStats,
  getPendingSyncRecords,
  getOutboxMutations,
  clearCompletedMutations,
  clearLocalDatabase
} from '../devTools.js';

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

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('FIELDNOTE Persistence & Outbox Test Suite (Prompt 5)');
  console.log('======================================================\n');

  // Clear any existing data
  await clearLocalDatabase();

  // ----------------------------------------------------
  // SECTION 1: Schema, Outbox Store & Migration
  // ----------------------------------------------------
  console.log('1. Database Creation, Schema v2 & Migration');
  assert(db.name === 'fieldnote_db', 'Database name is "fieldnote_db"');
  assert(db.tables.some((t) => t.name === 'projects'), 'Table "projects" exists');
  assert(db.tables.some((t) => t.name === 'tasks'), 'Table "tasks" exists');
  assert(db.tables.some((t) => t.name === 'outbox'), 'Table "outbox" exists in schema v2');

  // Test Non-destructive Migration: v1 -> v2
  console.log('\n2. Non-Destructive v1 -> v2 Schema Migration');
  const migrationDbName = 'fieldnote_migration_test_db';
  const v1Db = new Dexie(migrationDbName);
  v1Db.version(1).stores(STORES_V1);
  await v1Db.open();

  // Populate v1 data
  await v1Db.table('projects').add({
    id: 'legacy-proj-1',
    name: 'Legacy Field Project',
    description: 'Pre-migration project record',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    sync_status: SYNC_STATUS.SYNCED
  });
  await v1Db.table('tasks').add({
    id: 'legacy-task-1',
    project_id: 'legacy-proj-1',
    title: 'Pre-migration Task',
    status: TASK_STATUS.TODO,
    priority: TASK_PRIORITY.HIGH,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    sync_status: SYNC_STATUS.SYNCED
  });
  v1Db.close();

  // Re-open under schema v2
  const v2Db = new Dexie(migrationDbName);
  v2Db.version(1).stores(STORES_V1);
  v2Db.version(2).stores(STORES_V2);
  await v2Db.open();

  const migratedProject = await v2Db.table('projects').get('legacy-proj-1');
  const migratedTask = await v2Db.table('tasks').get('legacy-task-1');
  const outboxCount = await v2Db.table('outbox').count();

  assert(migratedProject && migratedProject.name === 'Legacy Field Project', 'Version-1 project data survived migration intact');
  assert(migratedTask && migratedTask.title === 'Pre-migration Task' && migratedTask.version === 1, 'Version-1 task data survived migration intact');
  assert(outboxCount === 0, 'New outbox table initialized correctly in migrated database');
  v2Db.close();
  await Dexie.delete(migrationDbName);

  // ----------------------------------------------------
  // SECTION 2: Project Creation & Outbox Insertion
  // ----------------------------------------------------
  console.log('\n3. Project Creation & Outbox CREATE Mutation');
  const proj1 = await projectRepository.createProject({
    name: 'Wind Farm Site Alpha',
    description: 'Offshore turbine electrical grid audit'
  });
  assert(proj1.id && typeof proj1.id === 'string', 'Project has valid client-generated UUID');
  assert(proj1.name === 'Wind Farm Site Alpha', 'Project name stored correctly');
  assert(proj1.sync_status === SYNC_STATUS.PENDING_CREATE, 'New local project has sync_status = PENDING_CREATE');

  // Verify atomic outbox mutation
  const projMutations = await outboxRepository.getMutationsByEntity(ENTITY_TYPE.PROJECT, proj1.id);
  assert(projMutations.length === 1, 'Exactly 1 outbox mutation recorded for created project');
  const projCreateMut = projMutations[0];
  assert(projCreateMut.operation === MUTATION_OPERATION.CREATE, 'Mutation operation is CREATE');
  assert(projCreateMut.entity_type === ENTITY_TYPE.PROJECT, 'Mutation entity_type is project');
  assert(projCreateMut.entity_id === proj1.id, 'Mutation entity_id matches project ID');
  assert(projCreateMut.status === MUTATION_STATUS.PENDING, 'Mutation initial status is PENDING');
  assert(projCreateMut.base_version === null, 'Project mutation base_version is null');
  assert(projCreateMut.idempotency_key && typeof projCreateMut.idempotency_key === 'string', 'Mutation has stable idempotency key');
  assert(projCreateMut.payload.name === 'Wind Farm Site Alpha', 'Payload contains clean project fields');
  assert(projCreateMut.payload.sync_status === undefined, 'Payload does NOT contain local sync_status metadata');

  // ----------------------------------------------------
  // SECTION 3: Task Creation & Version Tracking
  // ----------------------------------------------------
  console.log('\n4. Task Creation & Outbox CREATE Mutation');
  const task1 = await taskRepository.createTask({
    project_id: proj1.id,
    title: 'Inspect Transformer Bushings',
    description: 'Visual check and dielectric oil pressure test',
    priority: TASK_PRIORITY.HIGH,
    status: TASK_STATUS.TODO
  });
  assert(task1.id && typeof task1.id === 'string', 'Task has valid client-generated UUID');
  assert(task1.project_id === proj1.id, 'Task belongs to parent project');
  assert(task1.version === 0, 'Locally created task is initialized with version = 0');
  assert(task1.sync_status === SYNC_STATUS.PENDING_CREATE, 'New local task has sync_status = PENDING_CREATE');

  // Verify atomic task mutation in outbox
  const taskMutations = await outboxRepository.getMutationsByEntity(ENTITY_TYPE.TASK, task1.id);
  assert(taskMutations.length === 1, 'Exactly 1 outbox mutation recorded for created task');
  const taskCreateMut = taskMutations[0];
  assert(taskCreateMut.operation === MUTATION_OPERATION.CREATE, 'Task mutation operation is CREATE');
  assert(taskCreateMut.entity_id === task1.id, 'Task mutation entity_id matches task ID');
  assert(taskCreateMut.base_version === null, 'Local task mutation base_version is null (no server version assigned yet)');
  assert(taskCreateMut.idempotency_key && typeof taskCreateMut.idempotency_key === 'string', 'Task mutation has unique idempotency_key');
  assert(taskCreateMut.payload.title === 'Inspect Transformer Bushings', 'Payload contains task title');
  assert(taskCreateMut.payload.sync_status === undefined, 'Task payload excludes sync_status');

  // ----------------------------------------------------
  // SECTION 4: Safe Mutation Coalescing (CREATE + UPDATE)
  // ----------------------------------------------------
  console.log('\n5. Safe Mutation Coalescing (Pending CREATE + Subsequent UPDATE)');
  const initialTaskMutId = taskCreateMut.id;
  const initialTaskKey = taskCreateMut.idempotency_key;

  const updatedLocalTask = await taskRepository.updateTask(task1.id, {
    title: 'Inspect Transformer Bushings & Core Seals',
    priority: TASK_PRIORITY.HIGH
  });
  assert(updatedLocalTask.title === 'Inspect Transformer Bushings & Core Seals', 'Local task record updated');
  assert(updatedLocalTask.sync_status === SYNC_STATUS.PENDING_CREATE, 'Preserves PENDING_CREATE status');

  const postUpdateTaskMutations = await outboxRepository.getMutationsByEntity(ENTITY_TYPE.TASK, task1.id);
  assert(postUpdateTaskMutations.length === 1, 'Coalescing prevents duplicate mutation: still 1 mutation');
  const coalescedCreateMut = postUpdateTaskMutations[0];
  assert(coalescedCreateMut.id === initialTaskMutId, 'Original mutation ID preserved during coalescing');
  assert(coalescedCreateMut.idempotency_key === initialTaskKey, 'Original idempotency key preserved during coalescing');
  assert(coalescedCreateMut.payload.title === 'Inspect Transformer Bushings & Core Seals', 'Pending CREATE payload updated to latest entity state');

  // ----------------------------------------------------
  // SECTION 5: Server-Known Task Update & UPDATE Coalescing
  // ----------------------------------------------------
  console.log('\n6. Server-Known Task Update & Pending UPDATE Coalescing');
  // Seed a server-downloaded task with known server version = 2
  const serverTaskId = '22222222-2222-4222-a222-222222222222';
  const serverTask = await taskRepository.createTask({
    id: serverTaskId,
    project_id: proj1.id,
    title: 'Server Master Checklist',
    version: 2,
    sync_status: SYNC_STATUS.SYNCED
  });
  assert(serverTask.version === 2, 'Server task has version = 2');

  // First edit to server-known task -> enqueues UPDATE mutation with base_version = 2
  const firstEdit = await taskRepository.updateTask(serverTaskId, {
    status: TASK_STATUS.IN_PROGRESS
  });
  assert(firstEdit.version === 2, 'Local edit does NOT increment version locally (remains 2)');
  assert(firstEdit.sync_status === SYNC_STATUS.PENDING_UPDATE, 'Status transitions to PENDING_UPDATE');

  const serverTaskMutations1 = await outboxRepository.getMutationsByEntity(ENTITY_TYPE.TASK, serverTaskId);
  assert(serverTaskMutations1.length === 1, '1 UPDATE mutation enqueued for server-known task');
  const updateMut1 = serverTaskMutations1[0];
  assert(updateMut1.operation === MUTATION_OPERATION.UPDATE, 'Operation is UPDATE');
  assert(updateMut1.base_version === 2, 'base_version captures the server version (2) for optimistic concurrency');
  const initialUpdateMutId = updateMut1.id;
  const initialUpdateKey = updateMut1.idempotency_key;

  // Second edit to the same task while mutation is still PENDING -> coalesces into pending UPDATE
  const secondEdit = await taskRepository.updateTask(serverTaskId, {
    status: TASK_STATUS.COMPLETED,
    description: 'All 8 points passed verification.'
  });
  assert(secondEdit.status === TASK_STATUS.COMPLETED, 'Second edit updated status in entity store');

  const serverTaskMutations2 = await outboxRepository.getMutationsByEntity(ENTITY_TYPE.TASK, serverTaskId);
  assert(serverTaskMutations2.length === 1, 'Still exactly 1 mutation after repeated UPDATE edits');
  const coalescedUpdateMut = serverTaskMutations2[0];
  assert(coalescedUpdateMut.id === initialUpdateMutId, 'Preserves original UPDATE mutation ID');
  assert(coalescedUpdateMut.idempotency_key === initialUpdateKey, 'Preserves original idempotency key');
  assert(coalescedUpdateMut.base_version === 2, 'Preserves original base_version (2)');
  assert(coalescedUpdateMut.payload.status === TASK_STATUS.COMPLETED, 'Payload reflects latest status');
  assert(coalescedUpdateMut.payload.description === 'All 8 points passed verification.', 'Payload reflects latest description');

  // ----------------------------------------------------
  // SECTION 6: Local-Only Deletion Semantics
  // ----------------------------------------------------
  console.log('\n7. Local-Only Entity Deletion Semantics');
  // task1 was created locally and has pending outbox mutation
  await taskRepository.deleteTask(task1.id);
  const deletedLocalTask = await taskRepository.getTaskById(task1.id, { includeDeleted: true });
  assert(deletedLocalTask === null, 'Local-only task physically deleted from IndexedDB');

  const localTaskMutationsAfterDelete = await outboxRepository.getMutationsByEntity(ENTITY_TYPE.TASK, task1.id);
  assert(localTaskMutationsAfterDelete.length === 0, 'Pending outbox mutation for local-only task removed (no orphaned queue work)');

  // ----------------------------------------------------
  // SECTION 7: Server-Known Entity Deletion Semantics
  // ----------------------------------------------------
  console.log('\n8. Server-Known Entity Deletion Semantics');
  // serverTask had a pending UPDATE mutation with base_version = 2
  await taskRepository.deleteTask(serverTaskId);
  const serverTaskHidden = await taskRepository.getTaskById(serverTaskId);
  assert(serverTaskHidden === null, 'Server-known task hidden from normal getTaskById');

  const serverTaskTombstone = await taskRepository.getTaskById(serverTaskId, { includeDeleted: true });
  assert(
    serverTaskTombstone && serverTaskTombstone.sync_status === SYNC_STATUS.PENDING_DELETE,
    'Server-known task retained as PENDING_DELETE tombstone'
  );

  const serverTaskMutationsAfterDelete = await outboxRepository.getMutationsByEntity(ENTITY_TYPE.TASK, serverTaskId);
  assert(serverTaskMutationsAfterDelete.length === 1, 'Superseded previous UPDATE and kept exactly 1 mutation');
  const deleteMut = serverTaskMutationsAfterDelete[0];
  assert(deleteMut.operation === MUTATION_OPERATION.DELETE, 'Mutation operation is DELETE');
  assert(deleteMut.base_version === 2, 'DELETE mutation records correct server base_version (2)');

  // ----------------------------------------------------
  // SECTION 8: Project Deletion & Child Task Handling
  // ----------------------------------------------------
  console.log('\n9. Project Deletion with Child Tasks');
  // Create project with 1 local child task and 1 server child task
  const projWithChildren = await projectRepository.createProject({
    name: 'Substation Gamma',
    description: 'Transformer replacement project'
  });
  const localChild = await taskRepository.createTask({
    project_id: projWithChildren.id,
    title: 'Local Checklist Subtask'
  });
  const serverChild = await taskRepository.createTask({
    id: '33333333-3333-4333-a333-333333333333',
    project_id: projWithChildren.id,
    title: 'Server Checklist Subtask',
    version: 4,
    sync_status: SYNC_STATUS.SYNCED
  });

  // Deleting local-only project
  await projectRepository.deleteProject(projWithChildren.id);

  const projRecord = await projectRepository.getProjectById(projWithChildren.id, { includeDeleted: true });
  assert(projRecord === null, 'Local-only project physically deleted');

  const localChildRecord = await taskRepository.getTaskById(localChild.id, { includeDeleted: true });
  assert(localChildRecord === null, 'Local-only child task physically deleted');

  const localChildMutations = await outboxRepository.getMutationsByEntity(ENTITY_TYPE.TASK, localChild.id);
  assert(localChildMutations.length === 0, 'Local child outbox mutations removed');

  const serverChildTombstone = await taskRepository.getTaskById(serverChild.id, { includeDeleted: true });
  assert(serverChildTombstone && serverChildTombstone.sync_status === SYNC_STATUS.PENDING_DELETE, 'Server child task marked PENDING_DELETE');

  const serverChildMutations = await outboxRepository.getMutationsByEntity(ENTITY_TYPE.TASK, serverChild.id);
  assert(serverChildMutations.some((m) => m.operation === MUTATION_OPERATION.DELETE && m.base_version === 4), 'Server child task enqueued DELETE mutation with base_version = 4');

  // ----------------------------------------------------
  // SECTION 9: Transaction Atomicity & Rollback
  // ----------------------------------------------------
  console.log('\n10. Transaction Atomicity & Rollback');
  const beforeStats = await getLocalDatabaseStats();
  let threwExpected = false;

  try {
    // Attempt an atomic operation where mutation fails validation
    await db.transaction('rw', db.projects, db.outbox, async () => {
      const rollbackProj = {
        id: 'rollback-proj-test',
        name: 'Rollback Project Test',
        description: 'Should never persist',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sync_status: SYNC_STATUS.PENDING_CREATE
      };
      await db.projects.add(rollbackProj);

      // Intentionally invalid mutation (missing required idempotency_key)
      await outboxRepository.enqueueMutation({
        id: 'mut-fail',
        entity_type: ENTITY_TYPE.PROJECT,
        entity_id: rollbackProj.id,
        operation: MUTATION_OPERATION.CREATE,
        payload: {},
        idempotency_key: '' // Fails validation!
      });
    });
  } catch (err) {
    threwExpected = true;
  }

  assert(threwExpected, 'Invalid mutation threw transaction error');
  const rolledBackRecord = await db.projects.get('rollback-proj-test');
  assert(rolledBackRecord === undefined, 'Project record write was cleanly rolled back on outbox failure');

  const afterStats = await getLocalDatabaseStats();
  assert(afterStats.totalProjects === beforeStats.totalProjects, 'No partial entity state remains after rollback');

  // ----------------------------------------------------
  // SECTION 10: Outbox Lifecycle & State Transitions
  // ----------------------------------------------------
  console.log('\n11. Outbox Lifecycle Transitions & Inspection');
  const pendingMutations = await outboxRepository.getPendingMutations();
  assert(pendingMutations.length > 0, 'Pending mutations successfully queried in FIFO order');

  const testMut = pendingMutations[0];
  const origKey = testMut.idempotency_key;

  // PENDING -> PROCESSING
  const processingMut = await outboxRepository.markMutationProcessing(testMut.id);
  assert(processingMut.status === MUTATION_STATUS.PROCESSING, 'Status transitioned to PROCESSING');
  assert(processingMut.attempt_count === 1, 'attempt_count incremented to 1');
  assert(processingMut.last_attempt_at !== null, 'last_attempt_at recorded');
  assert(processingMut.idempotency_key === origKey, 'Idempotency key preserved in PROCESSING');

  // PROCESSING -> FAILED
  const failedMut = await outboxRepository.markMutationFailed(testMut.id, new Error('Network timeout (simulated)'));
  assert(failedMut.status === MUTATION_STATUS.FAILED, 'Status transitioned to FAILED');
  assert(failedMut.last_error === 'Network timeout (simulated)', 'Safe error message recorded');
  assert(failedMut.idempotency_key === origKey, 'Idempotency key preserved in FAILED');

  // FAILED -> PENDING (manual retry)
  const retriedMut = await outboxRepository.updateMutationStatus(testMut.id, MUTATION_STATUS.PENDING);
  assert(retriedMut.status === MUTATION_STATUS.PENDING, 'Status transitioned FAILED -> PENDING for retry');
  assert(retriedMut.idempotency_key === origKey, 'Idempotency key NOT regenerated during retry');

  // PENDING -> PROCESSING -> COMPLETED
  await outboxRepository.markMutationProcessing(testMut.id);
  const completedMut = await outboxRepository.markMutationCompleted(testMut.id);
  assert(completedMut.status === MUTATION_STATUS.COMPLETED, 'Status transitioned to COMPLETED');

  // Invalid transition test (COMPLETED cannot transition to PENDING)
  let invalidTransitionThrew = false;
  try {
    await outboxRepository.updateMutationStatus(testMut.id, MUTATION_STATUS.PENDING);
  } catch (err) {
    invalidTransitionThrew = true;
  }
  assert(invalidTransitionThrew, 'Prevented invalid status transition from COMPLETED to PENDING');

  // Cleanup completed mutations
  const clearedCount = await outboxRepository.clearCompletedMutations();
  assert(clearedCount >= 1, `Cleaned up ${clearedCount} completed mutation(s)`);

  const fetchedAfterClear = await outboxRepository.getMutationById(testMut.id);
  assert(fetchedAfterClear === null, 'Completed mutation cleared from outbox');

  // ----------------------------------------------------
  // SECTION 11: Developer Telemetry
  // ----------------------------------------------------
  console.log('\n12. Developer Tools & Telemetry Verification');
  const finalStats = await getLocalDatabaseStats();
  assert(typeof finalStats.outbox.total === 'number', 'Telemetry includes outbox.total');
  assert(typeof finalStats.outbox.pending === 'number', 'Telemetry includes outbox.pending');
  assert(typeof finalStats.outbox.failed === 'number', 'Telemetry includes outbox.failed');

  const allOutboxMutations = await getOutboxMutations();
  assert(Array.isArray(allOutboxMutations), 'getOutboxMutations returns an array of mutations');

  console.log('\n======================================================');
  console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});

