import { query } from '../config/database.js';
import * as projectService from './projectService.js';

/**
 * Retrieve all tasks, optionally filtered by project_id.
 */
export const getAllTasks = async (projectId = null) => {
  if (projectId) {
    const result = await query(
      `SELECT id, project_id, title, description, status, priority, due_date, created_at, updated_at, version
       FROM tasks
       WHERE project_id = $1
       ORDER BY created_at DESC`,
      [projectId]
    );
    return result.rows;
  }

  const result = await query(
    `SELECT id, project_id, title, description, status, priority, due_date, created_at, updated_at, version
     FROM tasks
     ORDER BY created_at DESC`
  );
  return result.rows;
};

/**
 * Retrieve a single task by its UUID.
 */
export const getTaskById = async (id) => {
  const result = await query(
    `SELECT id, project_id, title, description, status, priority, due_date, created_at, updated_at, version
     FROM tasks
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Create a new task with initial version = 1.
 */
export const createTask = async ({
  project_id,
  title,
  description = '',
  status = 'TODO',
  priority = 'MEDIUM',
  due_date = null
}) => {
  // Verify project exists to prevent foreign key errors
  const project = await projectService.getProjectById(project_id);
  if (!project) {
    const error = new Error(`Parent project with ID ${project_id} does not exist.`);
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  const result = await query(
    `INSERT INTO tasks (project_id, title, description, status, priority, due_date, version)
     VALUES ($1, $2, $3, $4, $5, $6, 1)
     RETURNING id, project_id, title, description, status, priority, due_date, created_at, updated_at, version`,
    [
      project_id,
      title.trim(),
      description ? description.trim() : '',
      status,
      priority,
      due_date ? new Date(due_date) : null
    ]
  );
  return result.rows[0];
};

/**
 * Update an existing task with optimistic concurrency control.
 * If client provides `version`, verify it matches current server version.
 * Increments version on every successful update: version = version + 1.
 */
export const updateTask = async (id, updates) => {
  const currentTask = await getTaskById(id);
  if (!currentTask) {
    return { notFound: true };
  }

  // Optimistic concurrency check
  if (updates.version !== undefined && updates.version !== null) {
    const clientVersion = parseInt(updates.version, 10);
    if (clientVersion !== currentTask.version) {
      return {
        conflict: true,
        serverTask: currentTask
      };
    }
  }

  // If changing project_id, verify target project exists
  if (updates.project_id && updates.project_id !== currentTask.project_id) {
    const project = await projectService.getProjectById(updates.project_id);
    if (!project) {
      const error = new Error(`Target project with ID ${updates.project_id} does not exist.`);
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }
  }

  const newTitle = updates.title !== undefined ? updates.title.trim() : currentTask.title;
  const newDesc = updates.description !== undefined ? updates.description.trim() : currentTask.description;
  const newStatus = updates.status !== undefined ? updates.status : currentTask.status;
  const newPriority = updates.priority !== undefined ? updates.priority : currentTask.priority;
  const newDueDate = updates.due_date !== undefined ? (updates.due_date ? new Date(updates.due_date) : null) : currentTask.due_date;
  const newProjectId = updates.project_id || currentTask.project_id;
  const nextVersion = currentTask.version + 1;

  const result = await query(
    `UPDATE tasks
     SET project_id = $1,
         title = $2,
         description = $3,
         status = $4,
         priority = $5,
         due_date = $6,
         updated_at = NOW(),
         version = $7
     WHERE id = $8
     RETURNING id, project_id, title, description, status, priority, due_date, created_at, updated_at, version`,
    [
      newProjectId,
      newTitle,
      newDesc,
      newStatus,
      newPriority,
      newDueDate,
      nextVersion,
      id
    ]
  );

  return { success: true, task: result.rows[0] };
};

/**
 * Delete a task by UUID.
 */
export const deleteTask = async (id) => {
  const result = await query(
    'DELETE FROM tasks WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rows.length > 0;
};
