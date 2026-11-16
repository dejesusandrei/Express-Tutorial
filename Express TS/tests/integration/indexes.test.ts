import { beforeAll, describe, expect, it } from "vitest";

import { query } from "../../src/utils/databaseQueryHelper.js";

/**
 * ============================================================================
 * Testing that the important indexes exist
 * ============================================================================
 * We can't reliably test "is it fast?" (time depends on the computer), but we
 * CAN test that the indexes that make it fast are there. If someone later
 * drops an index "to clean up", or builds a new database without running the
 * migration, this test turns red.
 *
 * We check the index DEFINITION, not its name, so it works whether the index
 * came from our migration or from a UNIQUE constraint in your table.
 *
 * Needs 006_indexes.sql applied to the test database.
 * ============================================================================
 */

type IndexRow = { tablename: string; indexdef: string };

let indexes: IndexRow[] = [];

beforeAll(async () => {
  const { rows } = await query<IndexRow>(
    "SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = 'public'"
  );
  indexes = rows;
});

const hasIndex = (table: string, pattern: RegExp): boolean =>
  indexes.some((row) => row.tablename === table && pattern.test(row.indexdef));

describe("indexes for the hot queries", () => {
  it("refresh_sessions.token_hash (every /refresh and /logout)", () => {
    expect(hasIndex("refresh_sessions", /\(token_hash\)/)).toBe(true);
  });

  it("refresh_sessions.user_id (revoke all sessions of a user)", () => {
    expect(hasIndex("refresh_sessions", /\(user_id\)/)).toBe(true);
  });

  it("tasks.owner_id (list MY tasks)", () => {
    // [,)] also accepts a composite index that starts with owner_id.
    expect(hasIndex("tasks", /\(owner_id[,)]/)).toBe(true);
  });

  it("users: UNIQUE on lower(email) (login lookup, and no duplicates by case)", () => {
    expect(hasIndex("users", /UNIQUE.*lower\(/)).toBe(true);
  });
});

describe("indexes from earlier lessons", () => {
  it("password_reset_tokens.token_hash is UNIQUE", () => {
    expect(hasIndex("password_reset_tokens", /UNIQUE.*\(token_hash\)/)).toBe(true);
  });

  it("email_verification_tokens.token_hash is UNIQUE", () => {
    expect(
      hasIndex("email_verification_tokens", /UNIQUE.*\(token_hash\)/)
    ).toBe(true);
  });
});