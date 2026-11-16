import { describe, expect, it } from "vitest";

import { AppError } from "../../src/errors/AppError.js";
import { handleDatabaseError } from "../../src/errors/databaseError.js";

/**
 * ============================================================================
 * Testing handleDatabaseError
 * ============================================================================
 * Feed it fake PostgreSQL errors (just objects with a "code") and check which
 * AppError comes out. No database needed.
 * ============================================================================
 */

// handleDatabaseError always throws. This runs it and returns what was thrown.
const thrownBy = (error: unknown): AppError => {
  try {
    handleDatabaseError(error);
  } catch (caught) {
    return caught as AppError;
  }
  throw new Error("handleDatabaseError did not throw");
};

const pgError = (fields: Record<string, string>) =>
  Object.assign(new Error("fake pg error"), fields);

describe("errors caused by the client's input", () => {
  it("duplicate email -> 409 EMAIL_ALREADY_EXISTS", () => {
    const error = thrownBy(
      pgError({ code: "23505", constraint: "users_email_unique" })
    );

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe("EMAIL_ALREADY_EXISTS");
  });

  it("duplicate email caught by the lower(email) index -> also 409", () => {
    const error = thrownBy(
      pgError({ code: "23505", constraint: "users_email_lower_uidx" })
    );

    expect(error.code).toBe("EMAIL_ALREADY_EXISTS");
  });

  it("any other unique violation -> 409 CONFLICT", () => {
    const error = thrownBy(
      pgError({ code: "23505", constraint: "something_else_key" })
    );

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe("CONFLICT");
  });

  it("bad UUID (22P02) -> 400, not a crash", () => {
    const error = thrownBy(pgError({ code: "22P02" }));

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("INVALID_INPUT");
  });

  it("value too long (22001) -> 400", () => {
    expect(thrownBy(pgError({ code: "22001" })).statusCode).toBe(400);
  });

  it("foreign key violation -> 400 INVALID_USER_REFERENCE", () => {
    const error = thrownBy(pgError({ code: "23503" }));

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("INVALID_USER_REFERENCE");
  });
});

describe("the database is slow or unavailable", () => {
  it("statement timeout (57014) -> 503 DATABASE_TIMEOUT", () => {
    const error = thrownBy(pgError({ code: "57014" }));

    expect(error.statusCode).toBe(503);
    expect(error.code).toBe("DATABASE_TIMEOUT");
  });

  it("deadlock (40P01) -> 503 DATABASE_BUSY", () => {
    expect(thrownBy(pgError({ code: "40P01" })).code).toBe("DATABASE_BUSY");
  });

  it("connection refused -> 503 DATABASE_UNAVAILABLE", () => {
    const error = thrownBy(pgError({ code: "ECONNREFUSED" }));

    expect(error.statusCode).toBe(503);
    expect(error.code).toBe("DATABASE_UNAVAILABLE");
  });

  it("pool exhausted (no SQLSTATE, only a message) -> 503", () => {
    const error = thrownBy(
      new Error("timeout exceeded when trying to connect")
    );

    expect(error.statusCode).toBe(503);
    expect(error.code).toBe("DATABASE_UNAVAILABLE");
  });
});

describe("safety", () => {
  it("an AppError passes through UNCHANGED (a 401 inside a transaction stays 401)", () => {
    const original = new AppError("Invalid reset link", 400, "INVALID_RESET_TOKEN");

    expect(thrownBy(original)).toBe(original);
  });

  it("an unknown error -> generic 500 that reveals nothing", () => {
    const error = thrownBy(
      pgError({ code: "42703", constraint: "secret_table_constraint" })
    );

    expect(error.statusCode).toBe(500);
    expect(error.code).toBe("DATABASE_ERROR");
    expect(error.message).toBe("Database error");
    expect(error.message).not.toContain("secret_table_constraint");
  });

  it("something that is not an error object -> generic 500", () => {
    expect(thrownBy("boom").statusCode).toBe(500);
    expect(thrownBy(undefined).statusCode).toBe(500);
  });
});