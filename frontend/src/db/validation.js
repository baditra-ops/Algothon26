import { TASK_STATUS, TASK_PRIORITY } from './schema.js';

export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Validate project record before storage.
 */
export function validateProject(project) {
  if (!project || typeof project !== 'object') {
    throw new ValidationError('Project payload must be an object.', 'project');
  }

  if (!project.name || typeof project.name !== 'string' || project.name.trim().length === 0) {
    throw new ValidationError('Project name is required and cannot be empty.', 'name');
  }

  return true;
}

/**
 * Validate task record before storage.
 */
export function validateTask(task) {
  if (!task || typeof task !== 'object') {
    throw new ValidationError('Task payload must be an object.', 'task');
  }

  if (!task.project_id || typeof task.project_id !== 'string') {
    throw new ValidationError('A valid project_id is required.', 'project_id');
  }

  if (!task.title || typeof task.title !== 'string' || task.title.trim().length === 0) {
    throw new ValidationError('Task title is required and cannot be empty.', 'title');
  }

  if (task.status && !Object.values(TASK_STATUS).includes(task.status)) {
    throw new ValidationError(
      `Invalid status '${task.status}'. Allowed: ${Object.values(TASK_STATUS).join(', ')}`,
      'status'
    );
  }

  if (task.priority && !Object.values(TASK_PRIORITY).includes(task.priority)) {
    throw new ValidationError(
      `Invalid priority '${task.priority}'. Allowed: ${Object.values(TASK_PRIORITY).join(', ')}`,
      'priority'
    );
  }

  return true;
}
