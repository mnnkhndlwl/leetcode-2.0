import { ZodError } from "zod";
import { HTTP } from "../constants/http.js";

export function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const fieldErrors = {};
        for (const issue of err.issues) {
          const path = issue.path.join(".") || "_";
          if (!fieldErrors[path]) fieldErrors[path] = issue.message;
        }
        const first = err.issues[0];
        return res.status(HTTP.BAD_REQUEST).json({
          error: first?.message || "Invalid request body",
          fieldErrors,
        });
      }
      next(err);
    }
  };
}
