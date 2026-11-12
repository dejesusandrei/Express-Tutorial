import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";

// jwt.ts reads env.jwtSecret. We REPLACE the real env module with a fake one,
// so the test doesn't need a .env file and always uses the same secret.
// (vi.mock is moved to the top of the file automatically.)
vi.mock("../../src/config/env.config.js", () => ({
  env: { jwtSecret: "a".repeat(64) },
}));

import { generateAccessToken, verifyAccessToken } from "../../src/utils/jwt";

/**
 * ============================================================================
 * Testing JWT: the happy path AND the attacks
 * ============================================================================
 * These tests protect security rules. If someone later removes the algorithm
 * pin or the issuer check "to simplify", a test here turns red.
 * ============================================================================
 */

const SECRET = "a".repeat(64);
const ISSUER = "express-tutorial-api"; // must match utils/jwt.ts
const AUDIENCE = "express-tutorial-client"; // must match utils/jwt.ts

// Runs a function and returns the error it throws (or undefined).
// verifyAccessToken throws an AppError; we want to inspect its .code.
const getError = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
};

// Build a valid-looking token with custom options, to simulate attackers.
const signCustom = (
  payload: object,
  secret: string,
  options: jwt.SignOptions = {}
) =>
  jwt.sign(payload, secret, {
    algorithm: "HS256",
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: "15m",
    ...options,
  });

const base64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

describe("generateAccessToken + verifyAccessToken", () => {
  it("round-trips: what goes in comes out", () => {
    const token = generateAccessToken("user-1", "session-1");

    expect(verifyAccessToken(token)).toEqual({
      userId: "user-1",
      sessionId: "session-1",
    });
  });
});

describe("verifyAccessToken rejects bad tokens", () => {
  it("rejects garbage", () => {
    expect(getError(() => verifyAccessToken("abc"))).toMatchObject({
      code: "INVALID_TOKEN",
      statusCode: 401,
    });
  });

  it("rejects a token whose payload was edited (signature no longer matches)", () => {
    const [header, payload, signature] = generateAccessToken( "user-1", "session-1" ).split(".");

    // The attacker changes userId to someone else, but can't re-sign it.
    const edited = JSON.parse(Buffer.from(payload, "base64url").toString());
    edited.userId = "someone-else";
    const forged = `${header}.${base64url(edited)}.${signature}`;

    expect(getError(() => verifyAccessToken(forged))).toMatchObject({
      code: "INVALID_TOKEN",
    });
  });

  it("rejects a token signed with the wrong secret", () => {
    const token = signCustom(
      { userId: "user-1", sessionId: "session-1" },
      "b".repeat(64)
    );

    expect(getError(() => verifyAccessToken(token))).toMatchObject({
      code: "INVALID_TOKEN",
    });
  });

  it('rejects the "none" algorithm attack (a token with NO signature)', () => {
    const unsigned = `${base64url({ alg: "none", typ: "JWT" })}.${base64url({
      userId: "user-1",
      sessionId: "session-1",
      iss: ISSUER,
      aud: AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + 900,
    })}.`;

    expect(getError(() => verifyAccessToken(unsigned))).toMatchObject({
      code: "INVALID_TOKEN",
    });
  });

  it("rejects a token meant for a different audience", () => {
    const token = signCustom(
      { userId: "user-1", sessionId: "session-1" },
      SECRET,
      { audience: "some-other-app" }
    );

    expect(getError(() => verifyAccessToken(token))).toMatchObject({
      code: "INVALID_TOKEN",
    });
  });

  it("rejects a token from a different issuer", () => {
    const token = signCustom(
      { userId: "user-1", sessionId: "session-1" },
      SECRET,
      { issuer: "some-other-server" }
    );

    expect(getError(() => verifyAccessToken(token))).toMatchObject({
      code: "INVALID_TOKEN",
    });
  });

  it("rejects an old-style token without a sessionId", () => {
    const token = signCustom({ userId: "user-1" }, SECRET);

    expect(getError(() => verifyAccessToken(token))).toMatchObject({
      code: "INVALID_TOKEN",
    });
  });
});

describe("verifyAccessToken: expiry", () => {
  it("returns TOKEN_EXPIRED (not INVALID_TOKEN) for an expired token", () => {
    // A negative expiresIn makes a token that expired 10 seconds ago.
    // The frontend uses this difference: expired -> call /refresh,
    // invalid -> go back to login.
    const token = signCustom(
      { userId: "user-1", sessionId: "session-1" },
      SECRET,
      { expiresIn: -10 }
    );

    expect(getError(() => verifyAccessToken(token))).toMatchObject({
      code: "TOKEN_EXPIRED",
      statusCode: 401,
    });
  });
});