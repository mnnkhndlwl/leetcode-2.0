import { HTTP } from "../constants/http.js";

// Accepts UUIDs, nanoids, ULIDs, etc. — letters, digits, '.', '_', '-'.
const KEY_RE = /^[A-Za-z0-9._-]{8,255}$/;

/**
 * Reads an optional `Idempotency-Key` header and attaches it to the request as
 * `req.idempotencyKey` (or `null` when absent). Rejects malformed keys so a
 * garbage value can never silently disable retry-safety.
 */
export function idempotencyKey(req, res, next) {
  const key = req.get("Idempotency-Key");

  if (key === undefined || key === null || key === "") {
    req.idempotencyKey = null;
    return next();
  }

  if (!KEY_RE.test(key)) {
    return res.status(HTTP.BAD_REQUEST).json({
      error:
        "Idempotency-Key must be 8-255 characters (letters, digits, '.', '_', '-')",
    });
  }

  req.idempotencyKey = key;
  next();
}
