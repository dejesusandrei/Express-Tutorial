import { z } from "zod";

/**
 * ============================================================================
 * PASSWORD POLICY: the "secret door code" rules
 * ============================================================================
 *
 * A short or easy password is like a door code of 1-2-3-4. A robot guesses it
 * in seconds. So when someone REGISTERS, we only accept codes that are:
 *   - long enough       (length is the strongest protection)
 *   - not too long      (see "max" below)
 *   - not a famous bad password ("password123" is guessed first by every robot)
 *
 * Modern advice (NIST 800-63B): prefer LENGTH over weird rules. Forcing
 * "1 capital + 1 symbol" makes people write "Password1!", which is weak.
 * A long passphrase like "purple-tricycle-eats-mango" is stronger AND easier
 * to remember.
 * ============================================================================
 */

// A tiny sample list. In real life use a bigger list, or the "Have I Been
// Pwned" Pwned Passwords API, which checks millions of leaked passwords.
const COMMON_PASSWORDS = new Set([
  "password",
  "password123",
  "1234567890",
  "12345678910",
  "qwertyuiop",
  "qwerty12345",
  "iloveyou123",
  "letmein1234",
  "admin12345",
  "welcome1234",
]);

// ---------------------------------------------------------------------------
// For REGISTER (and later: password reset / change password)
// ---------------------------------------------------------------------------
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  // Why a MAX? argon2 is intentionally slow and uses memory. Without a limit,
  // an attacker could send a 10 MB "password" and make your server work hard
  // for nothing (a cheap denial-of-service attack).
  .max(128, "Password must be at most 128 characters")
  // 10 spaces is "long" but not a real password.
  .refine((value) => value.trim().length >= 10, {
    message: "Password cannot be mostly spaces",
  })
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), {
    message: "That password is too common. Choose a different one",
  });

// ---------------------------------------------------------------------------
// For LOGIN
// ---------------------------------------------------------------------------
// Do NOT use the full policy at login:
//  - People who registered before a rule change would be locked out.
//  - Detailed errors at login tell attackers what the rules are.
// We only block empty and gigantic values (the same DoS protection as above).
export const loginPasswordSchema = z
  .string()
  .min(1, "Password is required")
  .max(128, "Password is too long");

/**
 * HOW TO USE
 * ----------
 *   user.schema.ts : password: passwordSchema
 *   auth.schema.ts : password: loginPasswordSchema
 * ============================================================================
 */