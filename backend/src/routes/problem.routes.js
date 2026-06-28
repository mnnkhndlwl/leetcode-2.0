import { Router } from "express";
import { getProblem, getProblems } from "../controllers/problem.controller.js";

const router = Router();

router.get("/", getProblems);
router.get("/:slug", getProblem);

export default router;
