export const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `API route not found: ${req.method} ${req.originalUrl}`
  });
};
