import { describe, expect, it } from "vitest";

import { parseEnv } from "../../src/config/parseEnv.js";

/**
 * ============================================================================
 * Testing environment validation
 * ============================================================================
 * parseEnv is a pure function: we hand it a fake "env" object and check what
 * comes back (or what it complains about). We never touch the real .env.
 * ============================================================================
 */

const SECRET = "x7Kp2mQ9vL4nR8sT1wY6zB3cD5fG0hJa"; // 32 characters, random-looking

// A fully valid environment. Each test changes only what it cares about.
const validEnv = (
  overrides: Record<string, string | undefined> = {}
) => ({
  NODE_ENV: "development",
  PORT: "3000",
  FRONTEND_URL: "http://localhost:5173",
  DB_HOST: "localhost",
  DB_PORT: "5432",
  DB_NAME: "express_dev",
  DB_USER: "postgres",
  DB_PASSWORD: "db-password-VALUE-123",
  JWT_SECRET: SECRET,
  ...overrides,
});

// Runs parseEnv and returns the error message ("" if it did not throw).
const errorOf = (
  raw: Record<string, string | undefined>
): string => {
  try {
    parseEnv(raw);
    return "";
  } catch (error) {
    return (error as Error).message;
  }
};

describe("parseEnv: valid settings", () => {
  it("returns typed settings (numbers are real numbers)", () => {
    const env = parseEnv(validEnv());

    expect(env.port).toBe(3000);
    expect(env.frontendUrl).toBe("http://localhost:5173");
    expect(env.jwtSecret).toBe(SECRET);
    expect(env.isProduction).toBe(false);
    expect(env.db).toEqual({
      host: "localhost",
      port: 5432,
      name: "express_dev",
      user: "postgres",
      password: "db-password-VALUE-123",
    });
  });

  it("uses safe defaults for optional settings", () => {
    const env = parseEnv(
      validEnv({
        NODE_ENV: undefined,
        PORT: undefined,
        DB_HOST: undefined,
        DB_PORT: undefined,
        TRUST_PROXY: undefined,
      })
    );

    expect(env.nodeEnv).toBe("development");
    expect(env.port).toBe(3000);
    expect(env.db.host).toBe("localhost");
    expect(env.db.port).toBe(5432);
    expect(env.trustProxy).toBe(0);
  });

  it("treats an empty value (PORT=) as not set, NOT as port 0", () => {
    expect(parseEnv(validEnv({ PORT: "" })).port).toBe(3000);
  });

  it("returns a frozen object (settings can't change at runtime)", () => {
    const env = parseEnv(validEnv());

    expect(Object.isFrozen(env)).toBe(true);
    expect(Object.isFrozen(env.db)).toBe(true);
  });
});

describe("parseEnv: secrets", () => {
  it("refuses to start without JWT_SECRET (no silent default)", () => {
    expect(errorOf(validEnv({ JWT_SECRET: undefined }))).toContain("JWT_SECRET");
  });

  it("rejects a JWT_SECRET shorter than 32 characters", () => {
    expect(errorOf(validEnv({ JWT_SECRET: "a".repeat(31) }))).toContain(
      "JWT_SECRET"
    );
  });

  it("accepts exactly 32 characters", () => {
    expect(errorOf(validEnv({ JWT_SECRET: "a1".repeat(16) }))).toBe("");
  });

  it("rejects a placeholder secret copied from an example", () => {
    expect(
      errorOf(validEnv({ JWT_SECRET: "changeme".padEnd(40, "x") }))
    ).toContain("JWT_SECRET");
  });

  it("NEVER prints the JWT secret in the error message", () => {
    const leaky = "my-short-secret-VALUE";

    expect(errorOf(validEnv({ JWT_SECRET: leaky }))).not.toContain(leaky);
  });

  it("NEVER prints the database password in the error message", () => {
    // Something else is wrong, and the message must still not leak the password.
    const message = errorOf(validEnv({ PORT: "abc" }));

    expect(message).toContain("PORT");
    expect(message).not.toContain("db-password-VALUE-123");
  });
});

describe("parseEnv: database settings", () => {
  it("requires DB_NAME, DB_USER, and DB_PASSWORD", () => {
    expect(errorOf(validEnv({ DB_NAME: undefined }))).toContain("DB_NAME");
    expect(errorOf(validEnv({ DB_USER: undefined }))).toContain("DB_USER");
    expect(errorOf(validEnv({ DB_PASSWORD: undefined }))).toContain("DB_PASSWORD");
  });

  it("rejects a DB_PORT that is not a number or out of range", () => {
    expect(errorOf(validEnv({ DB_PORT: "abc" }))).toContain("DB_PORT");
    expect(errorOf(validEnv({ DB_PORT: "70000" }))).toContain("DB_PORT");
  });
});

describe("parseEnv: other settings", () => {
  it("rejects a FRONTEND_URL that is not a URL", () => {
    expect(errorOf(validEnv({ FRONTEND_URL: "not a url" }))).toContain(
      "FRONTEND_URL"
    );
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(errorOf(validEnv({ NODE_ENV: "staging" }))).toContain("NODE_ENV");
  });

  it("rejects a PORT that is not a number or out of range", () => {
    expect(errorOf(validEnv({ PORT: "abc" }))).toContain("PORT");
    expect(errorOf(validEnv({ PORT: "70000" }))).toContain("PORT");
    expect(errorOf(validEnv({ PORT: "0" }))).toContain("PORT");
  });
});

describe("parseEnv: production rules", () => {
  it("requires https:// for FRONTEND_URL in production", () => {
    const message = errorOf(
      validEnv({ NODE_ENV: "production", FRONTEND_URL: "http://myapp.com" })
    );

    expect(message).toContain("FRONTEND_URL");
    expect(message).toContain("https://");
  });

  it("accepts an https FRONTEND_URL in production", () => {
    const env = parseEnv(
      validEnv({ NODE_ENV: "production", FRONTEND_URL: "https://myapp.com" })
    );

    expect(env.isProduction).toBe(true);
  });

  it("allows http://localhost outside production", () => {
    expect(errorOf(validEnv({ NODE_ENV: "development" }))).toBe("");
  });
});

describe("parseEnv: reports ALL problems at once", () => {
  it("lists every bad setting, so you fix them in one go", () => {
    const message = errorOf(
      validEnv({ JWT_SECRET: undefined, FRONTEND_URL: "nope", DB_NAME: undefined })
    );

    expect(message).toContain("JWT_SECRET");
    expect(message).toContain("FRONTEND_URL");
    expect(message).toContain("DB_NAME");
  });
});