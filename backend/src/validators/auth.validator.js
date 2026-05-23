import { z } from "zod";

export const signupSchema = z.object({
  username: z
    .string({ error: "username is required" })
    .trim()
    .min(3, { message: "username must be at least 3 characters" })
    .max(255, { message: "username must be at most 255 characters" })
    .regex(/^[a-zA-Z0-9_]+$/, {
      message: "username may only contain letters, numbers, and underscores",
    }),
  email: z
    .string({ error: "email is required" })
    .trim()
    .toLowerCase()
    .email({ message: "email must be a valid email address" })
    .max(255, { message: "email must be at most 255 characters" }),
  password: z
    .string({ error: "password is required" })
    .min(8, { message: "password must be at least 8 characters" })
    .max(128, { message: "password must be at most 128 characters" })
    .regex(/[a-z]/, {
      message: "password must contain at least one lowercase letter",
    })
    .regex(/[A-Z]/, {
      message: "password must contain at least one uppercase letter",
    })
    .regex(/[0-9]/, { message: "password must contain at least one number" }),
});

export const loginSchema = z.object({
  email: z
    .string({ error: "email is required" })
    .trim()
    .toLowerCase()
    .email({ message: "email must be a valid email address" }),
  password: z
    .string({ error: "password is required" })
    .min(1, { message: "password is required" }),
});
