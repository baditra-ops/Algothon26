export const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    status: 'error',
    message: 'API route not found',
    path: req.originalUrl
  });
};
