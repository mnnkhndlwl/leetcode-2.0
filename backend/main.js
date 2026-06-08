import "@dotenvx/dotenvx/config";
import express from "express";
import authRouter from "./src/routes/auth.routes.js";
import submitCodeRouter from "./src/routes/submission.routes.js";
import problemRouter from "./src/routes/problem.routes.js";
import { errorHandler } from "./src/middleware/errorHandler.js";

const app = express();
app.use(express.json());

app.use("/auth", authRouter);
app.use("/submissions", submitCodeRouter);
app.use("/problems", problemRouter);

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
