import { query } from "../utils/databaseQueryHelper.js";

/**
 * ============================================================================
 * ACCOUNT LOCKOUT: the "sleepy door" rule
 * ============================================================================
 * Rate limiting counts requests per IP. But a robot can switch IPs, so we ALSO
 * count wrong passwords per ACCOUNT. After too many wrong guesses, the account
 * "falls asleep" for a while, no matter which IP the guesses came from.
 *
 * Needs the columns from 003_login_lockout.sql.
 * ============================================================================
 */

// Called after a WRONG password.
// One single SQL statement, so two simultaneous wrong guesses can't both read
// "attempts = 4" and both write 5 (a race condition). The database does the
// +1 itself, safely.
//
// In an UPDATE, the right side of "=" always sees the OLD row values:
//   old attempts = 4  ->  4 + 1 = 5  ->  5 >= maxAttempts  ->  LOCK!
//
// When the lock starts we reset the counter to 0, so after the lock ends the
// person gets a fresh set of tries.
export const recordFailedLogin = async (
  userId: string,
  maxAttempts: number,
  lockMinutes: number
): Promise<void> => {
  await query(
    `
      UPDATE users
      SET failed_login_attempts = CASE
            WHEN failed_login_attempts + 1 >= $2 THEN 0
            ELSE failed_login_attempts + 1
          END,
          locked_until = CASE
            WHEN failed_login_attempts + 1 >= $2
              THEN NOW() + make_interval(mins => $3)
            ELSE locked_until
          END
      WHERE id = $1
    `,
    [userId, maxAttempts, lockMinutes]
  );
};

// Called after a CORRECT password: wipe the counter and any old lock.
// The WHERE skips the write when there is nothing to reset, so normal logins
// don't cause an extra database update every time.
export const resetFailedLogins = async (
  userId: string
): Promise<void> => {
  await query(
    `
      UPDATE users
      SET failed_login_attempts = 0,
          locked_until = NULL
      WHERE id = $1
        AND (failed_login_attempts <> 0 OR locked_until IS NOT NULL)
    `,
    [userId]
  );
};