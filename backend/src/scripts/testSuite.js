const API_BASE = 'http://localhost:5000/api';

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

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers
    }
  });

  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('\n======================================================');
  console.log('FIELDNOTE Backend & REST API Verification Suite');
  console.log('======================================================\n');

  // 1. Health check
  console.log('1. Health Check Endpoint');
  const health = await request('/health');
  assert(health.status === 200, 'GET /api/health returns 200');
  assert(health.data.status === 'ok', 'Status is "ok"');
  assert(health.data.service === 'fieldnote-api', 'Service is "fieldnote-api"');

  // 2. Project CRUD
  console.log('\n2. Project CRUD Operations');
  const createProj = await request('/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Site Alpha Inspection',
      description: 'Renewable wind farm baseline inspection'
    })
  });
  assert(createProj.status === 201, 'POST /api/projects returns 201');
  assert(createProj.data.id && typeof createProj.data.id === 'string', 'Project has valid UUID id');
  assert(createProj.data.name === 'Site Alpha Inspection', 'Project name matches');
  const projectId = createProj.data.id;

  // Get all projects
  const getProjs = await request('/projects');
  assert(getProjs.status === 200, 'GET /api/projects returns 200');
  assert(Array.isArray(getProjs.data) && getProjs.data.length >= 1, 'Projects list contains created project');

  // Get project by ID
  const getProj = await request(`/projects/${projectId}`);
  assert(getProj.status === 200, 'GET /api/projects/:id returns 200');
  assert(getProj.data.id === projectId, 'Returned project ID matches');

  // Update project
  const updateProj = await request(`/projects/${projectId}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: 'Site Alpha Inspection (Updated)',
      description: 'Updated inspection scope'
    })
  });
  assert(updateProj.status === 200, 'PUT /api/projects/:id returns 200');
  assert(updateProj.data.name === 'Site Alpha Inspection (Updated)', 'Project name successfully updated');

  // 3. Task CRUD & Version Increments
  console.log('\n3. Task Creation & Version Tracking');
  const createTask1 = await request('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      project_id: projectId,
      title: 'Inspect Turbine Substation A',
      description: 'Check voltage differentials and oil levels',
      status: 'TODO',
      priority: 'HIGH',
      due_date: '2026-10-15T00:00:00Z'
    })
  });
  assert(createTask1.status === 201, 'POST /api/tasks returns 201');
  assert(createTask1.data.id, 'Task has valid UUID id');
  assert(createTask1.data.project_id === projectId, 'Task belongs to target project');
  assert(createTask1.data.version === 1, 'Initial task version is 1');
  const taskId = createTask1.data.id;

  // Get all tasks
  const getTasks = await request('/tasks');
  assert(getTasks.status === 200, 'GET /api/tasks returns 200');
  assert(Array.isArray(getTasks.data) && getTasks.data.some((t) => t.id === taskId), 'Tasks list includes new task');

  // Filter tasks by project
  const getProjectTasks = await request(`/projects/${projectId}/tasks`);
  assert(getProjectTasks.status === 200, 'GET /api/projects/:projectId/tasks returns 200');
  assert(getProjectTasks.data.some((t) => t.id === taskId), 'Nested project tasks contains new task');

  // Get task by ID
  const getTask = await request(`/tasks/${taskId}`);
  assert(getTask.status === 200, 'GET /api/tasks/:id returns 200');
  assert(getTask.data.id === taskId, 'Task ID matches');

  // First Update -> version should become 2
  console.log('\n4. Task Version Increments');
  const updateTask1 = await request(`/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify({
      status: 'IN_PROGRESS',
      version: 1
    })
  });
  assert(updateTask1.status === 200, 'First PUT /api/tasks/:id with matching version returns 200');
  assert(updateTask1.data.status === 'IN_PROGRESS', 'Task status updated to IN_PROGRESS');
  assert(updateTask1.data.version === 2, 'Task version incremented from 1 to 2');

  // Second Update -> version should become 3
  const updateTask2 = await request(`/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify({
      description: 'Check voltage differentials, oil levels, and thermal sensors',
      version: 2
    })
  });
  assert(updateTask2.status === 200, 'Second PUT /api/tasks/:id with matching version returns 200');
  assert(updateTask2.data.version === 3, 'Task version incremented from 2 to 3');

  // 5. Validation & Error Handling Tests
  console.log('\n5. Validation & Edge Cases');
  // Invalid status
  const invalidStatus = await request('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      project_id: projectId,
      title: 'Invalid Status Task',
      status: 'NOT_A_VALID_STATUS'
    })
  });
  assert(invalidStatus.status === 400, 'POST task with invalid status returns 400');
  assert(invalidStatus.data.error === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');

  // Missing title
  const missingTitle = await request('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      project_id: projectId,
      title: '   '
    })
  });
  assert(missingTitle.status === 400, 'POST task with blank title returns 400');
  assert(missingTitle.data.error === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');

  // Non-existent task
  const nonExistent = await request('/tasks/00000000-0000-0000-0000-000000000000');
  assert(nonExistent.status === 404, 'GET non-existent task returns 404');
  assert(nonExistent.data.error === 'NOT_FOUND', 'Error code is NOT_FOUND');

  // 6. Version Conflict Test (HTTP 409)
  console.log('\n6. Optimistic Concurrency & Conflict Detection (HTTP 409)');
  // Server version is currently 3. Send update with stale version 2.
  const conflictUpdate = await request(`/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify({
      title: 'Stale update attempt',
      version: 2
    })
  });
  assert(conflictUpdate.status === 409, 'Stale PUT returns HTTP 409 Conflict');
  assert(conflictUpdate.data.error === 'VERSION_CONFLICT', 'Error code is VERSION_CONFLICT');
  assert(
    conflictUpdate.data.serverTask && conflictUpdate.data.serverTask.version === 3,
    '409 response includes serverTask with current version 3'
  );

  // Verify server data remained unchanged
  const verifyUnchanged = await request(`/tasks/${taskId}`);
  assert(verifyUnchanged.data.title !== 'Stale update attempt', 'Server task data remained unchanged');
  assert(verifyUnchanged.data.version === 3, 'Server task version remains at 3');

  // 7. Cascading Deletion Behavior
  console.log('\n7. Database Relationship & Foreign Key Cascading');
  // Deleting the parent project should cascade-delete all its child tasks
  const deleteProj = await request(`/projects/${projectId}`, {
    method: 'DELETE'
  });
  assert(deleteProj.status === 204, 'DELETE /api/projects/:id returns 204');

  // Verify project is gone
  const checkProjGone = await request(`/projects/${projectId}`);
  assert(checkProjGone.status === 404, 'Project is deleted (returns 404)');

  // Verify associated task is cascade-deleted
  const checkTaskGone = await request(`/tasks/${taskId}`);
  assert(checkTaskGone.status === 404, 'Child task was cascade-deleted (returns 404)');

  console.log('\n======================================================');
  console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
