import { HTTP } from "../constants/http.js";

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error(err);
  res.status(HTTP.INTERNAL).json({ error: "Internal server error" });
}
