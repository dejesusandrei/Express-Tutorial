import { z } from 'zod'
import { passwordSchema } from "./password.schema.js";

export const CreateUserSchema = z.object({
  name: z
    .string()
    .trim() // " Juan " -> "Juan"
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must not exceed 100 characters"),

  email: z
    .string()
    .trim()
    // Emails are case-insensitive in practice: "Juan@Mail.com" and
    // "juan@mail.com" are the same mailbox. If we stored them as typed, one
    // person could register twice, and login could fail by case. So we always
    // store lowercase.
    .toLowerCase()
    // 254 is the maximum length of a valid email address.
    // Without a max, someone could send a 5 MB "email".
    .max(254, "Email is too long")
    .email("Invalid email address"),

  // Full policy from password.schema.ts: 10-128 chars, no common passwords.
  // Do NOT .trim() passwords: spaces can be part of a real password.
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof CreateUserSchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;