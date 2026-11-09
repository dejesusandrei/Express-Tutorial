import { query } from "../utils/databaseQueryHelper.js";

/**
 * ============================================================================
 * PASSWORD RESET: database part
 * ============================================================================
 * Needs the table from 004_password_reset.sql.
 * Only token HASHES are stored. The real token exists only in the email link.
 * ============================================================================
 */

// Save a new reset token (hash only) for a user.
export const createResetToken = async (
  userId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<void> => {
  await query(
    `
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `,
    [userId, tokenHash, expiresAt]
  );
};

// Kill every unused link of this user.
// Called before creating a new one, so ONLY THE NEWEST link works. If someone
// clicks "forgot password" three times, the first two emails become useless.
export const invalidateAllForUser = async (userId: string): Promise<void> => {
  await query(
    `
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE user_id = $1
        AND used_at IS NULL
    `,
    [userId]
  );
};

// I-check kung valid pa ang token at markahan agad bilang used sa isang SQL statement.
// Ginagawa ito para maiwasan na magamit ang parehong token nang dalawang beses
// kapag may dalawang requests na sabay na dumating.
// Isang request lang ang makakagamit ng token; ang isa ay mare-reject.
// Ibabalik ang user ID kung valid ang token, otherwise null.
// Pare-pareho ang result kapag invalid, expired, o nagamit na ang token
// para hindi malaman ng iba kung ano ang eksaktong dahilan ng failure.
export const consumeToken = async (
  tokenHash: string
): Promise<string | null> => {
  const result = await query<{ user_id: string }>(
    `
      UPDATE password_reset_tokens
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

// Save the new password hash.
// (You can move this into user.repository.ts if you prefer.)
export const updatePasswordHash = async (
  userId: string,
  passwordHash: string
): Promise<void> => {
  await query(
    `
      UPDATE users
      SET password_hash = $2
      WHERE id = $1
    `,
    [userId, passwordHash]
  );
};

// Housekeeping: delete old rows so the table doesn't grow forever.
export const deleteOldTokens = async (): Promise<void> => {
  await query(
    `
      DELETE FROM password_reset_tokens
      WHERE expires_at < NOW() - INTERVAL '7 days'
    `
  );
};