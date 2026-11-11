import argon2 from "argon2";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ============================================================================
 * Testing login() with FAKE neighbours (mocks)
 * ============================================================================
 * A unit test checks ONE piece alone. login() talks to the database through
 * repositories, but we don't want a real database here: it's slow, and a
 * failure could be the database's fault instead of login's.
 *
 * So we replace each neighbour with a "cardboard cutout" (a mock) that we
 * control: we tell it what to answer, and we can ask it afterwards "were you
 * called? with what?".
 *
 * What we really test here are the SECURITY RULES of login:
 *   - same error for unknown email / wrong password / locked account
 *   - wrong passwords are counted
 *   - unverified email can't log in (and only after the right password)
 *   - success clears the counter and creates a session
 * ============================================================================
 */

// vi.hoisted: creates the fake functions BEFORE the vi.mock calls run.
// (vi.mock is moved to the top of the file, so normal variables wouldn't
// exist yet.)
const mocks = vi.hoisted(() => ({
  findByEmail: vi.fn(),
  recordFailedLogin: vi.fn(),
  resetFailedLogins: vi.fn(),
  createRefreshToken: vi.fn(),
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  hashRefreshToken: vi.fn(),
}));

vi.mock("../../src/repositories/user.repository.js", () => ({
  findByEmail: mocks.findByEmail,
  create: vi.fn(),
}));

vi.mock("../../src/repositories/userLockout.repository.js", () => ({
  recordFailedLogin: mocks.recordFailedLogin,
  resetFailedLogins: mocks.resetFailedLogins,
}));

vi.mock("../../src/repositories/refreshToken.repository.js", () => ({
  createRefreshToken: mocks.createRefreshToken,
  rotate: vi.fn(),
  findByTokenHash: vi.fn(),
  findActiveByTokenHash: vi.fn(),
  revokeById: vi.fn(),
  revokeAllForUser: vi.fn(),
}));

vi.mock("../../src/utils/jwt.js", () => ({
  generateAccessToken: mocks.generateAccessToken,
}));

vi.mock("../../src/utils/refreshToken.js", () => ({
  generateRefreshToken: mocks.generateRefreshToken,
  hashRefreshToken: mocks.hashRefreshToken,
}));

vi.mock("../../src/services/emailVerification.service.js", () => ({
  sendVerificationEmailFor: vi.fn(),
}));

import { login } from "../../src/services/auth.service.js";

const EMAIL = "batuta@email.com";
const PASSWORD = "correct-password-123";

// A real argon2 hash of PASSWORD, made once for all tests (it is slow on
// purpose, ~100 ms, so we don't redo it for every test).
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await argon2.hash(PASSWORD);
});

// Builds a user. Each test changes only what it cares about.
const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: "user-1",
  name: "Batuta",
  email: EMAIL,
  password_hash: passwordHash,
  role: "user",
  created_at: new Date(),
  failed_login_attempts: 0,
  locked_until: null,
  email_verified_at: new Date(),
  ...overrides,
});

beforeEach(() => {
  // Start every test clean: forget calls and answers from the previous test.
  vi.resetAllMocks();

  mocks.createRefreshToken.mockResolvedValue({ id: "session-1" });
  mocks.generateAccessToken.mockReturnValue("access-token");
  mocks.generateRefreshToken.mockReturnValue("raw-refresh-token");
  mocks.hashRefreshToken.mockReturnValue("hashed-refresh-token");
  mocks.recordFailedLogin.mockResolvedValue(undefined);
  mocks.resetFailedLogins.mockResolvedValue(undefined);
});

describe("login: failures all look the same from outside", () => {
  it("unknown email -> INVALID_CREDENTIALS and no session", async () => {
    mocks.findByEmail.mockResolvedValue(null);

    await expect(login({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject(
      { code: "INVALID_CREDENTIALS", statusCode: 401 }
    );

    expect(mocks.createRefreshToken).not.toHaveBeenCalled();
    expect(mocks.recordFailedLogin).not.toHaveBeenCalled(); // nobody to count for
  });

  it("wrong password -> INVALID_CREDENTIALS and the failure is counted", async () => {
    mocks.findByEmail.mockResolvedValue(makeUser());

    await expect(
      login({ email: EMAIL, password: "wrong-password-999" })
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", statusCode: 401 });

    // 5 attempts, locked for 15 minutes (the values in auth.service.ts)
    expect(mocks.recordFailedLogin).toHaveBeenCalledWith("user-1", 5, 15);
    expect(mocks.createRefreshToken).not.toHaveBeenCalled();
  });

  it("locked account + CORRECT password -> still INVALID_CREDENTIALS", async () => {
    const inTenMinutes = new Date(Date.now() + 10 * 60 * 1000);
    mocks.findByEmail.mockResolvedValue(makeUser({ locked_until: inTenMinutes }));

    await expect(login({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject(
      { code: "INVALID_CREDENTIALS", statusCode: 401 }
    );

    expect(mocks.createRefreshToken).not.toHaveBeenCalled();
    expect(mocks.recordFailedLogin).not.toHaveBeenCalled(); // locked: no counting
  });
});

describe("login: lock that already expired", () => {
  it("lets the user in once locked_until is in the past", async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    mocks.findByEmail.mockResolvedValue(makeUser({ locked_until: tenMinutesAgo }));

    const result = await login({ email: EMAIL, password: PASSWORD });

    expect(result.accessToken).toBe("access-token");
  });
});

describe("login: email verification", () => {
  it("correct password but unverified -> 403 EMAIL_NOT_VERIFIED", async () => {
    mocks.findByEmail.mockResolvedValue(makeUser({ email_verified_at: null }));

    await expect(login({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject(
      { code: "EMAIL_NOT_VERIFIED", statusCode: 403 }
    );

    expect(mocks.createRefreshToken).not.toHaveBeenCalled();
  });

  it("WRONG password and unverified -> INVALID_CREDENTIALS (doesn't reveal the account)", async () => {
    mocks.findByEmail.mockResolvedValue(makeUser({ email_verified_at: null }));

    await expect(
      login({ email: EMAIL, password: "wrong-password-999" })
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });
});

describe("login: success", () => {
  it("returns the tokens, clears the failure counter, and creates a session", async () => {
    const user = makeUser({ failed_login_attempts: 3 });
    mocks.findByEmail.mockResolvedValue(user);

    const result = await login({ email: EMAIL, password: PASSWORD });

    expect(result).toEqual({
      user,
      accessToken: "access-token",
      refreshToken: "raw-refresh-token",
    });

    // Old mistakes are wiped.
    expect(mocks.resetFailedLogins).toHaveBeenCalledWith("user-1");

    // Only the HASH of the refresh token is saved, never the raw token.
    expect(mocks.createRefreshToken).toHaveBeenCalledWith(
      "user-1",
      "hashed-refresh-token",
      expect.any(Date)
    );

    // The access token is tied to the new session.
    expect(mocks.generateAccessToken).toHaveBeenCalledWith("user-1", "session-1");
  });
});
