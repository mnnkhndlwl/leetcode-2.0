import { verifyToken } from "../utils/jwt.js";
import { HTTP } from "../constants/http.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(HTTP.UNAUTHORIZED).json({ error: "Missing token" });
  }
  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    res.status(HTTP.UNAUTHORIZED).json({ error: "Invalid token" });
  }
}
