export class ApiError extends Error {
  constructor(status, error, message, details) {
    super(message);
    this.status = status;
    this.error = error;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, 'bad_request', message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, 'unauthorized', message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, 'not_found', message);
  }

  static conflict(message) {
    return new ApiError(409, 'conflict', message);
  }
}

export function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: err.error,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  console.error('Unhandled error:', err);
  return res.status(500).json({
    error: 'internal_error',
    message: 'Unexpected server error',
  });
}
