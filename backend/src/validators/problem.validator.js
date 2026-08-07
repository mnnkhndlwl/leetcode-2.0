import { z } from "zod";

export const listProblemsQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(200, { message: "q cannot exceed 200 characters" })
    .optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(50),
});
