import db from './database.js';
import { SYNC_STATUS, TASK_STATUS, TASK_PRIORITY } from './schema.js';
import projectRepository from './repositories/projectRepository.js';
import taskRepository from './repositories/taskRepository.js';

/**
 * Development utilities for inspecting and managing the local IndexedDB database.
 */
export async function getLocalDatabaseStats() {
  const allProjects = await db.projects.toArray();
  const allTasks = await db.tasks.toArray();

  const projectStatusCounts = allProjects.reduce((acc, p) => {
    acc[p.sync_status] = (acc[p.sync_status] || 0) + 1;
    return acc;
  }, {});

  const taskStatusCounts = allTasks.reduce((acc, t) => {
    acc[t.sync_status] = (acc[t.sync_status] || 0) + 1;
    return acc;
  }, {});

  return {
    totalProjects: allProjects.length,
    activeProjects: allProjects.filter((p) => p.sync_status !== SYNC_STATUS.PENDING_DELETE).length,
    pendingDeleteProjects: allProjects.filter((p) => p.sync_status === SYNC_STATUS.PENDING_DELETE).length,
    projectSyncBreakdown: projectStatusCounts,
    totalTasks: allTasks.length,
    activeTasks: allTasks.filter((t) => t.sync_status !== SYNC_STATUS.PENDING_DELETE).length,
    pendingDeleteTasks: allTasks.filter((t) => t.sync_status === SYNC_STATUS.PENDING_DELETE).length,
    taskSyncBreakdown: taskStatusCounts
  };
}

/**
 * Retrieve all local entities marked with pending sync statuses.
 */
export async function getPendingSyncRecords() {
  const pendingProjects = await db.projects
    .filter((p) => p.sync_status !== SYNC_STATUS.SYNCED)
    .toArray();

  const pendingTasks = await db.tasks
    .filter((t) => t.sync_status !== SYNC_STATUS.SYNCED)
    .toArray();

  return {
    projects: pendingProjects,
    tasks: pendingTasks,
    totalPending: pendingProjects.length + pendingTasks.length
  };
}

/**
 * Wipe all local tables in IndexedDB (Development utility).
 */
export async function clearLocalDatabase() {
  await db.transaction('rw', db.projects, db.tasks, async () => {
    await db.projects.clear();
    await db.tasks.clear();
  });
  console.log('[FIELDNOTE DevTools] Local IndexedDB cleared.');
  return { success: true, message: 'Local database cleared' };
}

/**
 * Explicit seed utility for testing local offline workflow.
 * Only executes when explicitly triggered.
 */
export async function seedDevelopmentData() {
  const proj1 = await projectRepository.createProject({
    name: 'Coastal Wind Farm Survey',
    description: 'Offshore turbine electrical grid diagnostic and safety sweep.'
  });

  const proj2 = await projectRepository.createProject({
    name: 'Metro Substation Upgrades',
    description: 'Transformer maintenance and high-voltage circuit validation.'
  });

  await taskRepository.createTask({
    project_id: proj1.id,
    title: 'Inspect Rotor Blades — Turbine Alpha',
    description: 'Acoustic sweep and composite stress check on 3 blades.',
    status: TASK_STATUS.TODO,
    priority: TASK_PRIORITY.HIGH
  });

  await taskRepository.createTask({
    project_id: proj1.id,
    title: 'Verify Ground Earthing Cables',
    description: 'Measure earth resistance at sub-tower terminal.',
    status: TASK_STATUS.IN_PROGRESS,
    priority: TASK_PRIORITY.MEDIUM
  });

  await taskRepository.createTask({
    project_id: proj2.id,
    title: 'Thermal Imaging of Busbars',
    description: 'Infrared scan during peak load period.',
    status: TASK_STATUS.COMPLETED,
    priority: TASK_PRIORITY.HIGH
  });

  console.log('[FIELDNOTE DevTools] Sample development records seeded into IndexedDB.');
  return { success: true, projectIds: [proj1.id, proj2.id] };
}
