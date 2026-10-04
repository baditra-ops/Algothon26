import { Router } from 'express';
import {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject
} from '../controllers/projectController.js';
import { getTasks } from '../controllers/taskController.js';

const router = Router();

// /api/projects routes
router.get('/', getProjects);
router.get('/:id', getProject);
router.post('/', createProject);
router.put('/:id', updateProject);
router.delete('/:id', deleteProject);

// Nested route: /api/projects/:projectId/tasks
router.get('/:projectId/tasks', getTasks);

export default router;
