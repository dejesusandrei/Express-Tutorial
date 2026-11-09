import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";

import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";

import {generateSecureToken, hashSecureToken } from '../utils/secureToken.js';

import * as userRepository from "../repositories/user.repository.js";
import * as passwordResetRepository from "../repositories/passwordReset.repository.js";
import * as refreshTokenRepository from "../repositories/refreshToken.repository.js";
import * as userLockoutRepository from "../repositories/userLockout.repository.js";
import * as emailService from "./email.service.js";

/**
 * ============================================================================
 * PASSWORD RESET: the "one-time spare key" story
 * ============================================================================
 * You lost your house key. The locksmith (our server) does NOT ask "who are
 * you?" over the phone. He mails a ONE-TIME spare key to the address he has on
 * file (your email). Whoever can read that mail can come in.
 * That key:
 *   - is long and random      (can't be guessed)
 *   - works ONCE              (then it's destroyed)
 *   - expires in 30 minutes   (a stolen old email is useless)
 *   - only the NEWEST one works
 *   - changing the password kicks out every device that was logged in
 * ============================================================================
 */

const RESET_TOKEN_EXPIRY_MINUTES = 30;

// Build the link from OUR configured frontend URL.
// NEVER build it from req.headers.host: an attacker can fake that header and
// make us email a link pointing to THEIR site (host header injection), where
// they would steal the token.
const buildResetLink = (
  token: string
): string => {
  const url = new URL("/reset-password", env.frontendUrl);
  url.searchParams.set("token", token);
  return url.toString();
};


// ---------------------------------------------------------------------------
// STEP 1: "I forgot my password"
// ---------------------------------------------------------------------------
export const requestPasswordReset = async (
  email:string
): Promise<void> =>{
  const user = await userRepository.findByEmail(email);

  // No such account? Do NOTHING and return normally. The controller sends the
  // SAME response either way, so attackers can't use this form to find out
  // which emails are registered (user enumeration).
  if(!user) return;

  // Older unused links stop working. Only the newest one is valid.
  await passwordResetRepository.invalidateAllForUser(user.id);

  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

  // Only the HASH goes to the database.
  await passwordResetRepository.createResetToken(
    user.id,
    hashSecureToken(token),
    expiresAt
  );

  // We do NOT await the email. Sending takes time; if we waited, "account
  // exists" would respond slower than "no account", and a stopwatch would
  // reveal it. A failure is logged WITHOUT the link or token.
  void emailService
    .sendPasswordResetEmail(user.email, buildResetLink(token))
    .catch((error: Error) => {
      console.error("Failed to send password reset email:", error.message);
    });
};

// ---------------------------------------------------------------------------
// STEP 2: "Here is my token and my NEW password"
// ---------------------------------------------------------------------------
export const resetPassword =async (
  token: string,
  newPassword: string
): Promise<void> => {
  // Check the token and burn it in one atomic step (see the repository).
  // Wrong, expired, and already-used tokens all give the same answer.
  const userId = await passwordResetRepository.consumeToken(hashSecureToken(token));

  if (!userId) {
    throw new AppError("Invalid or expired reset link", 400, "INVALID_RESET_TOKEN");
  }

  // Save the new password (hashed with argon2, like at registration).
  const passwordHash = await argon2.hash(newPassword);
  await passwordResetRepository.updatePasswordHash(userId, passwordHash);

  // Kick the user out everywhere. If the old password was stolen, the thief's
  // sessions die now. Their access tokens stop at once too, because
  // authMiddleware checks that the session is still alive.
  await refreshTokenRepository.revokeAllForUser(userId);

  // Wipe failed-login counters and any lock: the owner just proved they own
  // the mailbox.
  await userLockoutRepository.resetFailedLogins(userId);
};