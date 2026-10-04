import 'fake-indexeddb/auto';
import { db } from '../database.js';
import { SYNC_STATUS, TASK_STATUS, TASK_PRIORITY } from '../schema.js';
import { projectRepository } from '../repositories/projectRepository.js';
import { taskRepository } from '../repositories/taskRepository.js';
import { getLocalDatabaseStats, getPendingSyncRecords, clearLocalDatabase } from '../devTools.js';

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
  console.log('FIELDNOTE Client Persistence (IndexedDB/Dexie) Test Suite');
  console.log('======================================================\n');

  // Clear any existing data
  await clearLocalDatabase();

  // TEST 1 — Database creation
  console.log('1. Database Creation & Schema');
  assert(db.name === 'fieldnote_db', 'Database name is "fieldnote_db"');
  assert(db.tables.some((t) => t.name === 'projects'), 'Table "projects" exists');
  assert(db.tables.some((t) => t.name === 'tasks'), 'Table "tasks" exists');

  // TEST 2 — Project creation
  console.log('\n2. Project Creation');
  const proj1 = await projectRepository.createProject({
    name: 'Wind Farm Site Alpha',
    description: 'Offshore turbine electrical grid audit'
  });
  assert(proj1.id && typeof proj1.id === 'string', 'Project has valid client-generated UUID');
  assert(proj1.name === 'Wind Farm Site Alpha', 'Project name stored correctly');
  assert(proj1.sync_status === SYNC_STATUS.PENDING_CREATE, 'New local project has sync_status = PENDING_CREATE');
  assert(proj1.created_at && proj1.updated_at, 'Project has ISO timestamps');

  // TEST 3 — Project retrieval
  console.log('\n3. Project Retrieval');
  const fetchedProj = await projectRepository.getProjectById(proj1.id);
  assert(fetchedProj && fetchedProj.id === proj1.id, 'Fetched project matches created ID');

  const allProjects = await projectRepository.getAllProjects();
  assert(allProjects.length === 1, 'getAllProjects returns 1 project');

  // TEST 4 — Project update
  console.log('\n4. Project Update');
  const updatedProj = await projectRepository.updateProject(proj1.id, {
    description: 'Updated scope of works and offshore permits'
  });
  assert(updatedProj.description === 'Updated scope of works and offshore permits', 'Description updated');
  assert(updatedProj.sync_status === SYNC_STATUS.PENDING_CREATE, 'Preserves PENDING_CREATE for unsynced local project');

  // TEST 5 — Task creation & version handling
  console.log('\n5. Task Creation & Version Tracking');
  const task1 = await taskRepository.createTask({
    project_id: proj1.id,
    title: 'Inspect Transformer Bushings',
    description: 'Visual check and dielectric oil pressure test',
    priority: TASK_PRIORITY.HIGH,
    status: TASK_STATUS.TODO
  });
  assert(task1.id && typeof task1.id === 'string', 'Task has valid client-generated UUID');
  assert(task1.project_id === proj1.id, 'Task belongs to parent project');
  assert(task1.version === 0, 'Locally created task is initialized with version = 0 (not server version)');
  assert(task1.sync_status === SYNC_STATUS.PENDING_CREATE, 'New local task has sync_status = PENDING_CREATE');

  // Second task on same project
  const task2 = await taskRepository.createTask({
    project_id: proj1.id,
    title: 'Earthing Continuity Verification',
    priority: TASK_PRIORITY.MEDIUM,
    status: TASK_STATUS.TODO
  });

  // Second project and task for filtering test
  const proj2 = await projectRepository.createProject({
    name: 'Metro Substation Beta',
    description: 'Urban electrical feeder replacement'
  });
  const task3 = await taskRepository.createTask({
    project_id: proj2.id,
    title: 'Switchgear Breaker Diagnostic',
    priority: TASK_PRIORITY.LOW,
    status: TASK_STATUS.TODO
  });

  // TEST 6 — Task filtering by project_id
  console.log('\n6. Task Filtering by Project');
  const proj1Tasks = await taskRepository.getTasksByProjectId(proj1.id);
  assert(proj1Tasks.length === 2, 'Project 1 has exactly 2 tasks');
  assert(proj1Tasks.every((t) => t.project_id === proj1.id), 'All tasks belong to Project 1');

  const proj2Tasks = await taskRepository.getTasksByProjectId(proj2.id);
  assert(proj2Tasks.length === 1, 'Project 2 has exactly 1 task');

  // TEST 7 — Task update & version preservation
  console.log('\n7. Task Update & Concurrency Version Preservation');
  const updatedTask1 = await taskRepository.updateTask(task1.id, {
    status: TASK_STATUS.IN_PROGRESS
  });
  assert(updatedTask1.status === TASK_STATUS.IN_PROGRESS, 'Task status updated to IN_PROGRESS');
  assert(updatedTask1.version === 0, 'Server version is NOT artificially incremented locally (remains 0)');

  // Test updating a server-downloaded task (version = 1, sync_status = SYNCED)
  const serverTask = await taskRepository.createTask({
    id: '11111111-1111-4111-a111-111111111111',
    project_id: proj1.id,
    title: 'Server Downloaded Checklist',
    version: 1,
    sync_status: SYNC_STATUS.SYNCED
  });
  assert(serverTask.version === 1, 'Downloaded server task has version = 1');
  assert(serverTask.sync_status === SYNC_STATUS.SYNCED, 'Downloaded server task has sync_status = SYNCED');

  const modifiedServerTask = await taskRepository.updateTask(serverTask.id, {
    status: TASK_STATUS.COMPLETED
  });
  assert(modifiedServerTask.version === 1, 'Local edit does NOT increment server version (remains 1 for optimistic concurrency)');
  assert(modifiedServerTask.sync_status === SYNC_STATUS.PENDING_UPDATE, 'Status transitions to PENDING_UPDATE');

  // TEST 8 — Deletion behavior: local-only vs server-known
  console.log('\n8. Local vs Server Deletion Semantics');
  // Local-only task deletion -> physical removal
  await taskRepository.deleteTask(task2.id);
  const task2Gone = await taskRepository.getTaskById(task2.id, { includeDeleted: true });
  assert(task2Gone === null, 'Local-only task is physically removed from IndexedDB');

  // Server-known task deletion -> soft delete (marked PENDING_DELETE)
  await taskRepository.deleteTask(serverTask.id);
  const serverTaskHidden = await taskRepository.getTaskById(serverTask.id);
  assert(serverTaskHidden === null, 'Server-known task hidden from normal getTaskById');

  const serverTaskRetained = await taskRepository.getTaskById(serverTask.id, { includeDeleted: true });
  assert(
    serverTaskRetained && serverTaskRetained.sync_status === SYNC_STATUS.PENDING_DELETE,
    'Server-known task is retained with sync_status = PENDING_DELETE for future sync engine'
  );

  // TEST 9 — Validation guards
  console.log('\n9. Client-Side Validation Guards');
  let threwProject = false;
  try {
    await projectRepository.createProject({ name: '   ' });
  } catch (err) {
    threwProject = true;
    assert(err.field === 'name', 'Empty project name caught by validation');
  }
  assert(threwProject, 'Blank project creation was rejected');

  let threwTask = false;
  try {
    await taskRepository.createTask({ project_id: proj1.id, title: '', status: 'INVALID' });
  } catch (err) {
    threwTask = true;
    assert(err.field === 'title', 'Blank task title caught by validation');
  }
  assert(threwTask, 'Blank task creation was rejected');

  // TEST 10 — Dev tools inspection
  console.log('\n10. Developer Tools & Telemetry');
  const stats = await getLocalDatabaseStats();
  assert(stats.totalProjects >= 2, 'Telemetry counts total projects');
  assert(stats.totalTasks >= 2, 'Telemetry counts total tasks');
  assert(stats.pendingDeleteTasks === 1, 'Telemetry counts 1 pending delete task');

  const pending = await getPendingSyncRecords();
  assert(pending.totalPending >= 3, 'Telemetry tracks all non-synced pending items');

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
  console.error('Test suite failed:', err);
  process.exit(1);
});
