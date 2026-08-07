import { ZodError } from "zod";
import { HTTP } from "../constants/http.js";

function zodErrorResponse(err, fallbackMessage) {
  const fieldErrors = {};
  for (const issue of err.issues) {
    const path = issue.path.join(".") || "_";
    if (!fieldErrors[path]) fieldErrors[path] = issue.message;
  }
  const first = err.issues[0];
  return {
    error: first?.message || fallbackMessage,
    fieldErrors,
  };
}

export function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(HTTP.BAD_REQUEST)
          .json(zodErrorResponse(err, "Invalid request body"));
      }
      next(err);
    }
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    try {
      // Express 5 may expose req.query as a getter — don't reassign it.
      req.validatedQuery = schema.parse(req.query);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(HTTP.BAD_REQUEST)
          .json(zodErrorResponse(err, "Invalid query parameters"));
      }
      next(err);
    }
  };
}
