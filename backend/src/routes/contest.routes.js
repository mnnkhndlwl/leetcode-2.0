import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  listContests,
  getContest,
  registerForContest,
  getLeaderboard,
} from "../controllers/contest.controller.js";

const router = Router();

router.get("/", listContests);
router.get("/:slug", getContest);
router.get("/:slug/leaderboard", getLeaderboard);
router.post("/:slug/register", requireAuth, registerForContest);

export default router;
