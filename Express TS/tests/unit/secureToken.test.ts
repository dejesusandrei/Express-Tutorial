import { describe, expect, it } from "vitest";

import { generateSecureToken, hashSecureToken } from "../../src/utils/secureToken";

/**
 * ============================================================================
 * Testing the one-time token helpers (password reset, email verification)
 * ============================================================================
 * We can't test "is it truly random?" with one test, but we CAN test the
 * promises the rest of the app relies on:
 *   - the shape is exactly what our schemas accept (64 hex characters)
 *   - two tokens are never the same
 *   - hashing is repeatable, and the hash is not the token itself
 * ============================================================================
 */

describe("generateSecureToken", () => {
  it("returns exatcly 64 hex characters (what the zod schema expect)", () => {
    expect(generateSecureToken()).toMatch(/^[a-f0-9]{64}$/);
  });

  it("it returns a different token every time", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateSecureToken()));

    expect(tokens.size).toBe(100);
  });
});

describe("hashSecureToken", () => {
  it("gives the same hash for the same token (needed to look it up later)", () => {
    const token = generateSecureToken();

    expect(hashSecureToken(token)).toBe(hashSecureToken(token));
  });

  it("gives a different hash for a different token", () => {
    expect(hashSecureToken("a".repeat(64))).not.toBe(hashSecureToken("b".repeat(64)));
  });

  it("never returns the token itself (the database must not hold the real token)", () => {
    const token = generateSecureToken();

    expect(hashSecureToken(token)).not.toBe(token);
  });

  it("returns a 64-character hex string (SHA-256)", () => {
    expect(hashSecureToken(generateSecureToken())).toMatch(/^[a-f0-9]{64}$/);
  });
});