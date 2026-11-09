import { query } from "../utils/databaseQueryHelper.js";

/**
 * ============================================================================
 * EMAIL VERIFICATION: database part
 * ============================================================================
 * Needs 005_email_verification.sql. Only token HASHES are stored.
 * ============================================================================
 */

// Save a new verification token (hash only).
export const createToken = async (
  userId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<void> => {
  await query(
    `
      INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `,
    [userId, tokenHash, expiresAt]
  );
};

// Kill every unused link of this user, so only the NEWEST link works.
export const invalidateAllForUser = async (userId: string): Promise<void> => {
  await query(
    `
      UPDATE email_verification_tokens
      SET used_at = NOW()
      WHERE user_id = $1
        AND used_at IS NULL
    `,
    [userId]
  );
};


// Check a token AND mark it used, in ONE SQL statement.
// Two requests with the same token can't both succeed: only one can change
// used_at from NULL to a date. Returns the user id, or null if the token is
// unknown, expired, or already used (we don't say which).
export const consumeToken = async (
  tokenHash: string
): Promise<string | null> => {
  const result = await query<{ user_id: string }>(
    `
      UPDATE email_verification_tokens
      SET used_at = NOW()
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING user_id
    `,
    [tokenHash]
  );

  return result.rows[0]?.user_id ?? null;
};


// Mark the user's email as verified. "AND email_verified_at IS NULL" keeps the
// ORIGINAL verification date if this somehow runs twice.
export const markEmailVerified = async (userId: string): Promise<void> => {
  await query(
    `
      UPDATE users
      SET email_verified_at = NOW()
      WHERE id = $1
        AND email_verified_at IS NULL
    `,
    [userId]
  );
};


// Housekeeping: delete old rows so the table doesn't grow forever.
export const deleteOldTokens = async (): Promise<void> => {
  await query(
    `
      DELETE FROM email_verification_tokens
      WHERE expires_at < NOW() - INTERVAL '7 days'
    `
  );
};