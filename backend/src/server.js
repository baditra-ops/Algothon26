import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import apiRouter from './routes/index.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Middlewares
app.use(express.json());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, Postman) or matching clientUrl
      if (!origin || origin === config.clientUrl || origin.startsWith('http://localhost:')) {
        callback(null, true);
      } else {
        callback(null, true); // Dev-friendly fallback
      }
    },
    credentials: true
  })
);

// Mount main API router
app.use('/api', apiRouter);

// Catch 404 for unknown endpoints
app.use(notFoundHandler);

// Central error handler
app.use(errorHandler);

// Start server
const server = app.listen(config.port, () => {
  console.log(`[FIELDNOTE Backend] Server running on port ${config.port}`);
  console.log(`[FIELDNOTE Backend] Health check: http://localhost:${config.port}/api/health`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('[FIELDNOTE Backend] SIGTERM received. Closing HTTP server...');
  server.close(() => {
    console.log('[FIELDNOTE Backend] Server closed.');
    process.exit(0);
  });
});

export default app;
