import { env } from "../config/env.config.js";
import { AppError } from "../errors/AppError.js";
import { generateSecureToken, hashSecureToken } from "../utils/secureToken.js";

import * as userRepository from "../repositories/user.repository.js";
import * as emailVerificationRepository from "../repositories/emailVerification.repository.js";
import * as emailService from "./email.service.js";


/**
 * ============================================================================
 * EMAIL VERIFICATION: the "mailed secret code" story
 * ============================================================================
 * Anyone can TYPE any email when they sign up, even one that isn't theirs
 * (a typo, or someone else's address). To prove "this mailbox is really
 * yours", we post a secret link to that address. If you can open it, you own
 * the mailbox.
 *
 * Same safety rules as the password reset link: long and random, stored as a
 * hash, single-use, expires, only the newest one works.
 * ============================================================================
 */

const VERIFY_TOKEN_EXPIRY_HOURS = 24;

// The link points to OUR frontend page. That page then calls
// POST /api/auth/verify-email with the token.
//
// Why not make the link call the API directly with GET?
//  - Email scanners and link previews "click" links automatically. A GET that
//    changes data would be triggered by robots, burning the token.
//  - GET requests that change data are easy to trigger from other sites.
// A POST made by our own page avoids both problems.
//
// The host comes from env.frontendUrl, NEVER from req.headers.host, which an
// attacker can fake (host header injection).
const buildVerifyLink = (token: string): string => {
  const url = new URL("/verify-email", env.frontendUrl);
  url.searchParams.set("token", token);
  return url.toString();
};

// ---------------------------------------------------------------------------
// Create a fresh link and email it.
// Used by register (first time) and by "resend".
// ---------------------------------------------------------------------------
export const sendVerificationEmailFor = async (
  user: {
    id: string;
    email: string;
  }
): Promise<void> => {
  // Older unused links stop working. Only the newest one is valid.
  await emailVerificationRepository.invalidateAllForUser(user.id);

  const token = generateSecureToken();
  const expiresAt = new Date(
    Date.now() + VERIFY_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000
  );

  // Only the HASH goes to the database.
  await emailVerificationRepository.createToken(
    user.id,
    hashSecureToken(token),
    expiresAt
  );

  // Not awaited: sending an email is slow, and we don't want the response
  // time to depend on it. A failure is logged WITHOUT the link or token.
  void emailService
    .sendVerificationEmail(user.email, buildVerifyLink(token))
    .catch((error: Error) => {
      console.error("Failed to send verification email:", error.message);
    });
};

// ---------------------------------------------------------------------------
// The user clicked the link: check the token and verify the email.
// ---------------------------------------------------------------------------
export const verifyEmail = async (
  token: string
): Promise<void> => {
  // Check and burn the token in one atomic step.
  // Unknown, expired, and already-used tokens all give the same answer.
  const userId = await emailVerificationRepository.consumeToken(
    hashSecureToken(token)
  );

  if (!userId) {
    throw new AppError("Invalid or expired verification link", 400, "INVALID_VERIFICATION_TOKEN");
  }

  await emailVerificationRepository.markEmailVerified(userId);
};

// ---------------------------------------------------------------------------
// "I didn't get the email" -> send it again.
// ---------------------------------------------------------------------------
export const resendVerification = async (email: string): Promise<void> => {
  const user = await userRepository.findByEmail(email);

  // No account, or already verified? Do nothing and return normally. The
  // controller gives the SAME answer in every case, so this form can't be
  // used to find out which emails are registered.
  if (!user || user.email_verified_at) return;

  await sendVerificationEmailFor(user);
};
