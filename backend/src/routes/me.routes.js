import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  getMyProblemStatus,
  getMyContests,
} from "../controllers/me.controller.js";

const router = Router();

router.get("/problem-status", requireAuth, getMyProblemStatus);
router.get("/contests", requireAuth, getMyContests);

export default router;

