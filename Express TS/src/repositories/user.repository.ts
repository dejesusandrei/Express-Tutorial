import type { User, CreateUserData } from "../types/User.js";
import { query } from "../utils/databaseQueryHelper.js";

/**
 * ============================================================================
 * USER REPOSITORY
 * ============================================================================
 * RULES
 *  - Always list the columns. Never SELECT * or RETURNING *.
 *  - Only findByEmail returns password_hash, because login needs it. Every
 *    other function returns PUBLIC columns only, so a secret can't leave the
 *    server by accident.
 *  - email_verified_at is public (the API docs promise it).
 * ============================================================================
 */

// The columns that are safe to send to a client.
const PUBLIC_COLUMNS = "id, name, email, role, created_at, email_verified_at";

export const findAll = async (): Promise<User[]> => {
  // NOTE: no LIMIT. Fine while only an admin can call it and the table is
  // small. Before this grows, paginate it like the tasks list.
  const result = await query<User>(
    `
      SELECT ${PUBLIC_COLUMNS}
      FROM users
      ORDER BY created_at DESC
    `
  );

  return result.rows;
};

export const findById = async (
  id: string
): Promise<User | undefined> => {
  const result = await query<User>(
    `
      SELECT ${PUBLIC_COLUMNS}
      FROM users
      WHERE id = $1
    `,
    [id]
  );

  return result.rows[0];
};

// Used by login. This is the ONLY function that returns password_hash.
export const findByEmail = async (
  email: string
): Promise<User | undefined> => {
  const result = await query<User>(
    `
      SELECT id, name, email, role, password_hash, created_at,
        failed_login_attempts, locked_until, email_verified_at
      FROM users
      WHERE LOWER(email) = LOWER($1)
    `,
    [email]
  );

  return result.rows[0];
};

export const create = async (
  user: CreateUserData
): Promise<User> => {
  const result = await query<User>(
    `
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING ${PUBLIC_COLUMNS}
    `,
    [user.name, user.email, user.password_hash, user.role]
  );

  return result.rows[0];
};

export const deleteById = async (
  id: string
): Promise<User | undefined> => {
  const result = await query<User>(
    `
      DELETE FROM users
      WHERE id = $1
      RETURNING ${PUBLIC_COLUMNS}
    `,
    [id]
  );

  return result.rows[0];
};

// ${PUBLIC_COLUMNS} is a constant written in THIS file, never user input, so
// putting it inside the SQL text is safe. User input always goes in the values
// array ($1, $2...).
//
// The old createUserWithProfile example was removed on purpose: it inserted a
// hardcoded user ("juan@example.com" with a fake hash) into a "profiles" table
// that doesn't exist. Example code that touches real tables does not belong
// in a repository. If you want to keep it as a note, put it in a README.