import { TASK_STATUS, TASK_PRIORITY, ENTITY_TYPE, MUTATION_OPERATION, MUTATION_STATUS } from './schema.js';

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

/**
 * Validate an outbox mutation before enqueueing.
 */
export function validateMutation(mutation) {
  if (!mutation || typeof mutation !== 'object') {
    throw new ValidationError('Mutation must be a non-null object.', 'mutation');
  }

  if (!mutation.id || typeof mutation.id !== 'string' || mutation.id.trim().length === 0) {
    throw new ValidationError('Mutation id is required.', 'id');
  }

  if (!mutation.entity_type || !Object.values(ENTITY_TYPE).includes(mutation.entity_type)) {
    throw new ValidationError(
      `Invalid entity_type '${mutation.entity_type}'. Allowed: ${Object.values(ENTITY_TYPE).join(', ')}`,
      'entity_type'
    );
  }

  if (!mutation.entity_id || typeof mutation.entity_id !== 'string' || mutation.entity_id.trim().length === 0) {
    throw new ValidationError('Mutation entity_id is required.', 'entity_id');
  }

  if (!mutation.operation || !Object.values(MUTATION_OPERATION).includes(mutation.operation)) {
    throw new ValidationError(
      `Invalid operation '${mutation.operation}'. Allowed: ${Object.values(MUTATION_OPERATION).join(', ')}`,
      'operation'
    );
  }

  if (!mutation.status || !Object.values(MUTATION_STATUS).includes(mutation.status)) {
    throw new ValidationError(
      `Invalid status '${mutation.status}'. Allowed: ${Object.values(MUTATION_STATUS).join(', ')}`,
      'status'
    );
  }

  if (!mutation.idempotency_key || typeof mutation.idempotency_key !== 'string' || mutation.idempotency_key.trim().length === 0) {
    throw new ValidationError('Mutation idempotency_key is required.', 'idempotency_key');
  }

  if (!mutation.created_at || isNaN(Date.parse(mutation.created_at))) {
    throw new ValidationError('Valid ISO created_at timestamp is required.', 'created_at');
  }

  if (!mutation.updated_at || isNaN(Date.parse(mutation.updated_at))) {
    throw new ValidationError('Valid ISO updated_at timestamp is required.', 'updated_at');
  }

  if (typeof mutation.attempt_count !== 'number' || mutation.attempt_count < 0) {
    throw new ValidationError('attempt_count must be a non-negative integer.', 'attempt_count');
  }

  if (!mutation.payload || typeof mutation.payload !== 'object') {
    throw new ValidationError('Mutation payload must be an object.', 'payload');
  }

  return true;
}

