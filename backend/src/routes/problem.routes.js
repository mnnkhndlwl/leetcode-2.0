import { Router } from "express";
import { getProblem, getProblems } from "../controllers/problem.controller.js";
import { validateQuery } from "../middleware/validate.js";
import { listProblemsQuerySchema } from "../validators/problem.validator.js";

const router = Router();

router.get("/", validateQuery(listProblemsQuerySchema), getProblems);
router.get("/:slug", getProblem);

export default router;
