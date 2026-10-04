import { Router } from 'express';
import healthRoutes from './health.routes.js';
import projectRoutes from './projectRoutes.js';
import taskRoutes from './taskRoutes.js';

const apiRouter = Router();

// Mount API resources
apiRouter.use('/health', healthRoutes);
apiRouter.use('/projects', projectRoutes);
apiRouter.use('/tasks', taskRoutes);

export default apiRouter;
