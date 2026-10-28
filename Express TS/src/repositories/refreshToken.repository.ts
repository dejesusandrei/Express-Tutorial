import { query } from "../utils/databaseQueryHelper.js";
import type { RefreshSession } from "../types/RefreshSession.js";

/**
 * Refresh token repository
 * ------------------------
 * Only the HASH of the refresh token is stored in the database, never the raw token.
 * If the database leaks, the attacker still can't use the tokens.
 *
 * Functions:
 *  createRefreshToken()    -> saves a new session (used on login)
 *  findActiveByTokenHash() -> finds a session that is not revoked and not expired
 *  rotate()                -> atomically revokes the old session and creates a new one
 *  revokeById()            -> revokes one session (logout on this device)
 *  revokeAllForUser()      -> revokes every session of a user (logout everywhere,
 *                             password change)
 *  deleteExpired()         -> housekeeping: removes old rows from the table
 */

// Insert a new session. Called on login.
export const createRefreshToken = async (
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

// Find a session that is still usable:
//  - hash matches
//  - not revoked (revoked_at IS NULL)
//  - not expired (expires_at > NOW())
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

// Find a session by hash in ANY state (active, revoked, or expired).
// Used for reuse detection: if rotate() fails, this tells us WHY it failed.
export const findByTokenHash = async (
  tokenHash: string
): Promise<RefreshSession | null> => {
  const result = await query<RefreshSession>(
    `
      SELECT id, user_id, token_hash, expires_at, created_at, revoked_at
      FROM refresh_sessions
      WHERE token_hash = $1
      LIMIT 1
    `,
    [tokenHash]
  );

  return result.rows[0] ?? null;
};

/**
 * Token rotation in ONE SQL statement.
 *
 * Why one statement?
 *  1. Atomic: a single statement in Postgres either fully succeeds or fully fails.
 *     You can never end up with "old token revoked but new one not created".
 *  2. Race-safe: the UPDATE only matches rows where revoked_at IS NULL.
 *     If two requests use the same old token at the same time, only ONE of them
 *     gets a row back from the UPDATE. The other gets nothing and returns null.
 *
 * Returns the NEW session, or null if the old token was invalid, expired,
 * already revoked, or already used by another request.
 */
export const rotate = async (
  oldTokenHash: string,
  newTokenHash: string,
  newExpiresAt: Date
): Promise<RefreshSession | null> => {
  const result = await query<RefreshSession>(
    `
      WITH revoked AS (
        UPDATE refresh_sessions
        SET revoked_at = NOW()
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND expires_at > NOW()
        RETURNING user_id
      )
      INSERT INTO refresh_sessions (user_id, token_hash, expires_at)
      SELECT user_id, $2, $3
      FROM revoked
      RETURNING *
    `,
    [oldTokenHash, newTokenHash, newExpiresAt]
  );

  return result.rows[0] ?? null;
};

// Revoke one session by ID.
// Example: user logs out from the current device.
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

// Revoke all active sessions of a user.
// Example: "log out from all devices", or after a password change.
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

// Housekeeping: delete sessions that expired or were revoked more than 30 days ago.
// Without this the table grows forever. Run it from a cron job or scheduled task.
export const deleteExpired = async (): Promise<number> => {
  const result = await query(
    `
      DELETE FROM refresh_sessions
      WHERE expires_at < NOW() - INTERVAL '30 days'
      OR revoked_at < NOW() - INTERVAL '30 days'
    `
  );

  return result.rowCount ?? 0;
};