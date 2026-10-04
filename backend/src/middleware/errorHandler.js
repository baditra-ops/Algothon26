/**
 * Centralized error handler returning consistent JSON responses.
 * Never exposes raw PostgreSQL internal error stacks or connection details to the client.
 */
export const errorHandler = (err, req, res, next) => {
  // If headers already sent, delegate to standard Express handler
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;
  const errorCode = err.code || (statusCode === 400 ? 'VALIDATION_ERROR' : statusCode === 404 ? 'NOT_FOUND' : statusCode === 409 ? 'VERSION_CONFLICT' : 'INTERNAL_SERVER_ERROR');
  const message = err.message || 'An unexpected server error occurred.';

  // Log detailed error on server console for developers
  console.error(`[FIELDNOTE API Error] ${req.method} ${req.originalUrl} (${statusCode}):`, {
    code: errorCode,
    message: err.message,
    stack: err.stack,
    details: err.details
  });

  const response = {
    error: errorCode,
    message
  };

  if (err.serverTask) {
    response.serverTask = err.serverTask;
  }

  if (err.details) {
    response.details = err.details;
  }

  res.status(statusCode).json(response);
};
