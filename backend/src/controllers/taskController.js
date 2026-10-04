import * as taskService from '../services/taskService.js';
import * as projectService from '../services/projectService.js';

const isValidUUID = (id) => {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
};

const ALLOWED_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED'];
const ALLOWED_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];

export const getTasks = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const queryProjectId = req.query.projectId;
    const targetProjectId = projectId || queryProjectId || null;

    if (targetProjectId && !isValidUUID(targetProjectId)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid project ID format. Must be a valid UUID.'
      });
    }

    const tasks = await taskService.getAllTasks(targetProjectId);
    res.status(200).json(tasks);
  } catch (error) {
    next(error);
  }
};

export const getTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid task ID format. Must be a valid UUID.'
      });
    }

    const task = await taskService.getTaskById(id);
    if (!task) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Task with ID ${id} not found.`
      });
    }

    res.status(200).json(task);
  } catch (error) {
    next(error);
  }
};

export const createTask = async (req, res, next) => {
  try {
    const { project_id, title, description, status, priority, due_date } = req.body;

    if (!project_id || !isValidUUID(project_id)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'A valid project_id (UUID) is required.'
      });
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Task title is required and cannot be empty.'
      });
    }

    if (status && !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: `Invalid status '${status}'. Must be one of: ${ALLOWED_STATUSES.join(', ')}`
      });
    }

    if (priority && !ALLOWED_PRIORITIES.includes(priority)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: `Invalid priority '${priority}'. Must be one of: ${ALLOWED_PRIORITIES.join(', ')}`
      });
    }

    const task = await taskService.createTask({
      project_id,
      title,
      description,
      status: status || 'TODO',
      priority: priority || 'MEDIUM',
      due_date
    });

    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
};

export const updateTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid task ID format. Must be a valid UUID.'
      });
    }

    const { project_id, title, description, status, priority, due_date, version } = req.body;

    if (project_id !== undefined && !isValidUUID(project_id)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'project_id must be a valid UUID.'
      });
    }

    if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Task title cannot be empty.'
      });
    }

    if (status !== undefined && !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: `Invalid status '${status}'. Must be one of: ${ALLOWED_STATUSES.join(', ')}`
      });
    }

    if (priority !== undefined && !ALLOWED_PRIORITIES.includes(priority)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: `Invalid priority '${priority}'. Must be one of: ${ALLOWED_PRIORITIES.join(', ')}`
      });
    }

    if (version !== undefined && (isNaN(parseInt(version, 10)) || parseInt(version, 10) < 1)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Version must be a positive integer.'
      });
    }

    const result = await taskService.updateTask(id, {
      project_id,
      title,
      description,
      status,
      priority,
      due_date,
      version
    });

    if (result.notFound) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Task with ID ${id} not found.`
      });
    }

    if (result.conflict) {
      return res.status(409).json({
        error: 'VERSION_CONFLICT',
        message: 'The task has been modified on the server.',
        serverTask: result.serverTask
      });
    }

    res.status(200).json(result.task);
  } catch (error) {
    next(error);
  }
};

export const deleteTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid task ID format. Must be a valid UUID.'
      });
    }

    const deleted = await taskService.deleteTask(id);
    if (!deleted) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Task with ID ${id} not found.`
      });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
