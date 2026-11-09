import { createHash, randomBytes } from "node:crypto";

/**
 * ============================================================================
 * One-time tokens (email verification, password reset)
 * ============================================================================
 * Both features need the same thing: a secret that can be put in a link, and
 * a safe way to store it. They live here once, so they can't drift apart.
 * ============================================================================
 */

// 32 random bytes from the operating system's secure random generator, written
// as 64 hex characters. Impossible to guess.
// (Never use Math.random() or dates for secrets: those are predictable.)
export const generateSecureToken = (): string =>
  randomBytes(32).toString("hex");

// We store only the hash, never the token itself. If the database leaks, the
// hashes are useless. SHA-256 is enough here (no slow argon2 needed) because
// the token is already long and random, unlike a human-chosen password.
export const hashSecureToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");