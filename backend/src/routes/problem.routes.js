import { Router } from "express";
import { getProblem } from "../controllers/problem.controller.js";

const router = Router();

router.get("/:slug", getProblem);

export default router;
