import * as projectService from '../services/projectService.js';

// Basic UUID v4 format validator
const isValidUUID = (id) => {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
};

export const getProjects = async (req, res, next) => {
  try {
    const projects = await projectService.getAllProjects();
    res.status(200).json(projects);
  } catch (error) {
    next(error);
  }
};

export const getProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid project ID format. Must be a valid UUID.'
      });
    }

    const project = await projectService.getProjectById(id);
    if (!project) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Project with ID ${id} not found.`
      });
    }

    res.status(200).json(project);
  } catch (error) {
    next(error);
  }
};

export const createProject = async (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Project name is required and cannot be empty.'
      });
    }

    const newProject = await projectService.createProject({ name, description });
    res.status(201).json(newProject);
  } catch (error) {
    next(error);
  }
};

export const updateProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid project ID format. Must be a valid UUID.'
      });
    }

    const { name, description } = req.body;

    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Project name cannot be empty.'
      });
    }

    const updated = await projectService.updateProject(id, { name, description });
    if (!updated) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Project with ID ${id} not found.`
      });
    }

    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

export const deleteProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid project ID format. Must be a valid UUID.'
      });
    }

    const deleted = await projectService.deleteProject(id);
    if (!deleted) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Project with ID ${id} not found.`
      });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
