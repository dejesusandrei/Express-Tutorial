import { env } from "../config/env.js";

/**
 * ============================================================================
 * EMAIL SERVICE (temporary stub)
 * ============================================================================
 * We don't have a real email provider yet (Resend, SendGrid, Nodemailer...).
 * For now, in development we just PRINT the email in the server terminal, so
 * you can copy the link from there. We'll connect a real provider in the
 * email verification lesson.
 *
 * In production this throws on purpose: a stub that silently "sends" nothing
 * would make users wait for emails that never arrive.
 * ============================================================================
 */
export const sendPasswordResetEmail = async (
  to: string,
  resetLink: string
): Promise<void> => {
  if (env.nodeEnv === "production") {
    throw new Error("Email provider is not configured yet");
  }

  // DEV ONLY: never print reset links in production logs. Anyone who can read
  // the logs could take over accounts with them.
  console.log(`[DEV EMAIL] To: ${to}`);
  console.log(`[DEV EMAIL] Reset link: ${resetLink}`);
};