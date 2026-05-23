import { Router } from "express";
import { submitCode } from "../controllers/submission.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { submitCodeSchema } from "../validators/submission.validator.js";

const router = Router();

router.post("/", requireAuth, validateBody(submitCodeSchema), submitCode);

export default router;
