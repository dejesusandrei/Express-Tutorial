import { z } from "zod";

/**
 * ============================================================================
 * EMAIL VERIFICATION: input checkers
 * ============================================================================
 */

// The token from the link. Ours are exactly 64 hex characters (0-9, a-f).
// Anything else is rejected before touching the database.
export const VerifyEmailSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "Invalid verification token"),
});

// "Send me the link again". Same email cleaning as registration.
export const ResendVerificationSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Email is too long")
    .email("Invalid email address"),
});

export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof ResendVerificationSchema>;