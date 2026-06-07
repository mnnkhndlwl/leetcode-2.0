import { z } from "zod";
import { SUPPORTED_LANGUAGES } from "../constants/languages.js";

export const submitCodeSchema = z.object({
  problemId: z
    .string({ error: "problemId is required" })
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      { message: "problemId must be a valid UUID" },
    ),

  language: z.enum(SUPPORTED_LANGUAGES, {
    error: `language must be one of: ${SUPPORTED_LANGUAGES.join(", ")}`,
  }),

  code: z
    .string({ error: "code is required" })
    .min(1, { message: "code cannot be empty" })
    .max(65536, { message: "code cannot exceed 64KB" }),
});
