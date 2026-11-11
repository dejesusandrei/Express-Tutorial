import { describe, expect, it } from "vitest";

import { loginPasswordSchema, passwordSchema } from '../../src/schema/password.schema';

/**
 * ============================================================================
 * Testing the password policy
 * ============================================================================
 * This is the EASIEST kind of test: a "pure" function. Same input, same
 * output, no database, no network, nothing to fake.
 *
 * Every test has three parts (AAA):
 *   Arrange : prepare the input
 *   Act     : run the code
 *   Assert  : check the result
 *
 * safeParse() never throws. It returns { success: true/false }, so we can
 * simply check .success.
 * ============================================================================
 */

describe("passwordSchema (used at register / reset)", () => {
  it("acccepts a normal strong password", () =>{
    expect(passwordSchema.safeParse('batuta12345haha').success).toBe(true);
  });

  it("accepts a passphrase with spaces (length matters, not symbols)", () => {
    expect(passwordSchema.safeParse("purple tricycle eats mango").success).toBe(true);
  });

  // Boundary tests: the numbers right at the edge are where bugs hide.
  it("rejects 9 characters (just under the minimum)", () => {
    expect(passwordSchema.safeParse("a".repeat(9)).success).toBe(false);
  });

  it("accepts exactly 10 characters (the minimum)", () => {
    expect(passwordSchema.safeParse("abcdefghij").success).toBe(true);
  });

  it("accepts exactly 128 characters (the maximum)", () => {
    expect(passwordSchema.safeParse("a1".repeat(64)).success).toBe(true);
  });

  it("rejects 129 characters (stops huge inputs from hammering argon2)", () => {
    expect(passwordSchema.safeParse("a".repeat(129)).success).toBe(false);
  });

  it("rejects a famous common password", () => {
    expect(passwordSchema.safeParse("password123").success).toBe(false);
  });

  it("rejects a common password even in different letter case", () => {
    expect(passwordSchema.safeParse("PASSWORD123").success).toBe(false);
  });

  it("rejects a password made of spaces only", () => {
    expect(passwordSchema.safeParse(" ".repeat(12)).success).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(passwordSchema.safeParse(1234567890).success).toBe(false);
  });
});

describe("loginPasswordSchema (used at login)", () => {
  // At login we must NOT apply the full policy, or users who registered under
  // an older, looser rule would be locked out.
  it("accepts a short password (policy is not enforced at login)", () => {
    expect(loginPasswordSchema.safeParse("x").success).toBe(true);
  });

  it("rejects an empty password", () => {
    expect(loginPasswordSchema.safeParse("").success).toBe(false);
  });

  it("rejects a password over 128 characters", () => {
    expect(loginPasswordSchema.safeParse("a".repeat(129)).success).toBe(false);
  });
});