import { Router } from "express";
import { submitCode, getSubmission } from "../controllers/submission.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { idempotencyKey } from "../middleware/idempotency.js";
import { submitCodeSchema } from "../validators/submission.validator.js";

const router = Router();

router.post(
  "/",
  requireAuth,
  idempotencyKey,
  validateBody(submitCodeSchema),
  submitCode,
);
router.get("/:id", requireAuth, getSubmission);

export default router;
