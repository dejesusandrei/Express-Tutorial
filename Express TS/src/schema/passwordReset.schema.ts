import { z } from "zod";
import { passwordSchema } from "./password.schema.js";

/**
 * ============================================================================
 * PASSWORD RESET: input checkers
 * ============================================================================
 */

// Step 1: "I forgot my password" -> only an email is needed.
// Same cleaning as registration (trim, lowercase, max length), otherwise
// "Juan@Mail.com" would not match the stored "juan@mail.com".
export const ForgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Email is too long")
    .email("Invalid email address"),
});

// Step 2: "Here is my token and my new password".
export const ResetPasswordSchema = z.object({
  // Our tokens are 32 random bytes written as hex = exactly 64 characters
  // (0-9, a-f). Rejecting anything else immediately saves a database query
  // and blocks junk input.
  token: z.string().regex(/^[a-f0-9]{64}$/, "Invalid reset token"),

  // The SAME policy as registration (10-128 chars, no common passwords).
  // Never allow a weaker password through the reset door.
  password: passwordSchema,
});

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;