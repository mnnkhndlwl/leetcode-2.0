import { Router } from "express";
import { submitCode } from "../controllers/submission.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/", requireAuth, submitCode);

export default router;
