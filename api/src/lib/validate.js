import { ApiError } from './errors.js';

function toDetails(zodError) {
  return zodError.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

function validate(source, schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(
        ApiError.badRequest(`Invalid request ${source}`, toDetails(result.error)),
      );
    }
    // Parsed output carries coercions and defaults, so downstream handlers
    // always see normalized values.
    req.validated = { ...req.validated, [source]: result.data };
    next();
  };
}

export const validateBody = (schema) => validate('body', schema);
export const validateQuery = (schema) => validate('query', schema);
