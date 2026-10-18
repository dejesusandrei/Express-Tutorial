import { query } from "../utils/databaseQueryHelper.js";
import { RefreshSession } from '../types/RefreshSession.js'


// create() =	Saves a new refresh-token session.
// findActiveByTokenHash() =	Finds a token that hasn't expired or been revoked.
// revokeById() =	Revokes one session, such as during logout or token rotation.
// revokeAllForUser() =	Revokes all active sessions for a user, useful for logging out everywhere.

export const createrefreshToken = async (
  userId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<RefreshSession> => {
  const result = await query<RefreshSession>(
    `
      INSERT INTO refresh_sessions (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
      RETURNING *
    `,
    [userId, tokenHash, expiresAt]
  );
  return result.rows[0];
};

export const findActiveByTokenHash = async (
  tokenHash: string
): Promise<RefreshSession | null> => {
  const result = await query<RefreshSession>(
    `
      SELECT id, user_id, token_hash, expires_at, created_at, revoked_at
      FROM refresh_sessions
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    `,
    [tokenHash]
  );

  return result.rows[0] ?? null;
};


// Revoke a refresh token by its ID
// Example: User logs out from their current device.
export const revokeById = async (
  sessionId: string
): Promise<void> => {
  await query(
    `
      UPDATE refresh_sessions
      SET revoked_at = NOW()
      WHERE id = $1
        AND revoked_at IS NULL
    `,
    [sessionId]
  );
};


// Revokes all active refresh sessions belonging to that user.
// Example: User logs out from all devices or changes their password.
export const revokeAllForUser = async (
  userId: string
): Promise<void> => {
  await query(
    `
      UPDATE refresh_sessions
      SET revoked_at = NOW()
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [userId]
  );
};