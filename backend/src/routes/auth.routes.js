import { Router } from "express";
import { signup, login } from "../controllers/auth.controller.js";
import { validateBody } from "../middleware/validate.js";
import { signupSchema, loginSchema } from "../validators/auth.validator.js";

const router = Router();

router.post("/signup", validateBody(signupSchema), signup);
router.post("/login", validateBody(loginSchema), login);

export default router;
