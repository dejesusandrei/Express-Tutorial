import { beforeEach, describe, expect, it, vi } from "vitest";
console.log("ENV CHECK:", process.env.NODE_ENV, process.env.DISABLE_RATE_LIMIT);
// Import ang database query helper at test helpers.
import { query } from "../../src/utils/databaseQueryHelper.js";
import { resetDatabase } from "../helpers/db.js";
import { clearOutbox, outbox } from "../helpers/emailOutbox.js";

import {
  cookieFrom,
  createVerifiedUser,
  get,
  getAs,
  loginUser,
  post,
  postWithOrigin,
  postWithoutOrigin,
  registerUser,
  tokenFromLink,
} from "../helpers/http.js";

// Palitan muna ang actual email sender para hindi totoong mag-send ng email.
// Ise-save lang ang emails sa outbox para magamit sa tests.
vi.mock("../../src/services/email.service.js", async () => {

  // Kunin ang outbox para dito natin ilagay ang emails.
  const { outbox } = await import("../helpers/emailOutbox.js");

  // Ibalik ang functions na gagamitin kapalit ng actual email sender.
  return {
    sendVerificationEmail: async (to: string, link: string) => {
      // I-save ang verification email at link.
      outbox.verification.push({ to, link });
    },

    sendPasswordResetEmail: async (to: string, link: string) => {
      // I-save ang password reset email at link.
      outbox.reset.push({ to, link });
    },
  };
});

/**
 * Integration tests para i-check kung gumagana
 * nang tama ang buong authentication process.
 */

// Test account details
const EMAIL = "juan@example.com";
const PASSWORD = "correct-horse-battery";
const WRONG_PASSWORD = "wrong-password-999";

// beforeEach() runs bago magsimula ang bawat test.
// async allows us to use await inside the function.
beforeEach(async () => {
  await resetDatabase(); // Linisin ang database.
  clearOutbox(); // Linisin ang saved emails.

  // spyOn() monitors a function.
  // mockImplementation() replaces its original behavior.
  // Dito, pinapatahimik natin ang error logs habang nagte-test.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// describe() groups related tests para mas organized.
describe("CSRF: Origin check on /api/auth", () => {

  // it() represents one test case.
  it("rejects a POST with no Origin header", async () => {
    const res = await postWithoutOrigin("/api/auth/login").send({
      email: EMAIL,
      password: PASSWORD,
    });

    // expect() checks kung tama ang result.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ORIGIN_REQUIRED");
  });

  it("rejects a POST from another website", async () => {
    const res = await postWithOrigin("/api/auth/login", "http://evil.com").send(
      { email: EMAIL, password: PASSWORD }
    );

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("INVALID_ORIGIN");
  });
});

describe("register", () => {
  it("creates an UNVERIFIED user and sends a verification email", async () => {
    const res = await registerUser(EMAIL, PASSWORD);

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(EMAIL);

    // <email_verified_at: Date | null> is a TypeScript generic type.
    // Ibig sabihin, Date or null ang expected value ng email_verified_at.
    const { rows } = await query<{ email_verified_at: Date | null }>(
      "SELECT email_verified_at FROM users WHERE email = $1",
      [EMAIL]
    );

    // toBeNull() checks kung null ang value.
    expect(rows[0].email_verified_at).toBeNull();

    // toHaveLength() checks kung ilang items ang laman ng array.
    expect(outbox.verification).toHaveLength(1);
    expect(outbox.verification[0].to).toBe(EMAIL);
  });

  it("never sends password_hash back", async () => {
    const res = await registerUser(EMAIL, PASSWORD);

    // not means kabaliktaran ng expected result.
    // Checks kung walang password_hash sa response.
    expect(res.body.data.user).not.toHaveProperty("password_hash");

    // JSON.stringify() converts an object into a string.
    // Checks kung walang argon2 information sa response.
    expect(JSON.stringify(res.body)).not.toContain("argon2");
  });

  it("does not expose internal lockout fields", async () => {
    const res = await registerUser(EMAIL, PASSWORD);

    // Siguraduhing hindi kasama ang internal security fields.
    expect(res.body.data.user).not.toHaveProperty("failed_login_attempts");
    expect(res.body.data.user).not.toHaveProperty("locked_until");
  });

  it("rejects a weak password", async () => {
    const res = await registerUser(EMAIL, "password123");

    expect(res.status).toBe(400);
  });

  it("stores the email in lowercase", async () => {
    await registerUser("Juan@Example.COM", PASSWORD);

    // <email: string> means string ang expected type ng email.
    const { rows } = await query<{ email: string }>(
      "SELECT email FROM users"
    );

    expect(rows[0].email).toBe("juan@example.com");
  });

  it("rejects a second account with the same email", async () => {
    await registerUser(EMAIL, PASSWORD);
    const res = await registerUser(EMAIL, PASSWORD);

    // toBeGreaterThanOrEqual() means greater than or equal to.
    // toBeLessThan() means less than.
    // Together, chine-check kung 4xx ang response status.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

describe("email verification and login", () => {
  it("cannot log in before verifying the email", async () => {
    await registerUser(EMAIL, PASSWORD);

    const res = await loginUser(EMAIL, PASSWORD);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("wrong password on an unverified account looks like any other failure", async () => {
    await registerUser(EMAIL, PASSWORD);

    const res = await loginUser(EMAIL, WRONG_PASSWORD);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("verifies with the emailed link, once only, then login works", async () => {
    await registerUser(EMAIL, PASSWORD);

    // Kunin ang token mula sa saved verification email.
    const token = tokenFromLink(outbox.verification[0].link);

    const first = await post("/api/auth/verify-email").send({ token });
    expect(first.status).toBe(200);

    // Subukang gamitin ulit ang parehong token.
    const replay = await post("/api/auth/verify-email").send({ token });

    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe("INVALID_VERIFICATION_TOKEN");

    const login = await loginUser(EMAIL, PASSWORD);

    expect(login.status).toBe(200);

    // typeof checks the data type ng value.
    expect(typeof login.body.data.accessToken).toBe("string");
  });

  it("an expired verification link is rejected", async () => {
    await registerUser(EMAIL, PASSWORD);
    const token = tokenFromLink(outbox.verification[0].link);

    // Baguhin ang expiration date para maging expired na ang token.
    await query(
      "UPDATE email_verification_tokens SET expires_at = NOW() - INTERVAL '1 minute'"
    );

    const res = await post("/api/auth/verify-email").send({ token });

    expect(res.status).toBe(400);
  });

  it("only the NEWEST verification link works after a resend", async () => {
    await registerUser(EMAIL, PASSWORD);

    // Mag-request ng bagong verification email.
    await post("/api/auth/resend-verification").send({ email: EMAIL });

    const oldToken = tokenFromLink(outbox.verification[0].link);
    const newToken = tokenFromLink(outbox.verification[1].link);

    // Dapat hindi na gumana ang lumang token.
    const oldTry = await post("/api/auth/verify-email").send({ token: oldToken });
    expect(oldTry.status).toBe(400);

    // Dapat gumana ang bagong token.
    const newTry = await post("/api/auth/verify-email").send({ token: newToken });
    expect(newTry.status).toBe(200);
  });
});

describe("login failures all look the same", () => {
  it("unknown email and wrong password give the SAME response", async () => {
    await createVerifiedUser(EMAIL, PASSWORD);

    const unknown = await loginUser("nobody@example.com", PASSWORD);
    const wrong = await loginUser(EMAIL, WRONG_PASSWORD);

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);

    // toEqual() compares the entire response objects.
    // Dapat pareho ang response para hindi malaman kung registered ang email.
    expect(unknown.body).toEqual(wrong.body);
  });

  it("login sets an httpOnly refresh cookie", async () => {
    await createVerifiedUser(EMAIL, PASSWORD);

    const res = await loginUser(EMAIL, PASSWORD);

    expect(res.status).toBe(200);

    // as is a TypeScript type assertion.
    // Dito, sinasabi natin na ituring ang raw value bilang string array.
    const raw = res.headers["set-cookie"] as unknown as string[];

    // join() combines array items into one string.
    expect(raw.join(";")).toContain("HttpOnly");

    expect(cookieFrom(res)).toBeTruthy();
  });
});

describe("protected routes and logout", () => {
  it("rejects a request with no token", async () => {
    const res = await get("/api/users/me");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("rejects a garbage token", async () => {
    const res = await getAs("/api/users/me", "abc");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });

  it("accepts a valid token and returns only YOUR data", async () => {
    await createVerifiedUser(EMAIL, PASSWORD);
    const login = await loginUser(EMAIL, PASSWORD);

    // Gamitin ang access token sa protected route.
    const res = await getAs("/api/users/me", login.body.data.accessToken);

    expect(res.status).toBe(200);

    // I-convert ang response object sa string para ma-check ang email.
    expect(JSON.stringify(res.body)).toContain(EMAIL);
  });

  it("after logout, the SAME access token stops working (SESSION_ENDED)", async () => {
    await createVerifiedUser(EMAIL, PASSWORD);
    const login = await loginUser(EMAIL, PASSWORD);

    const accessToken = login.body.data.accessToken;

    // ! is a non-null assertion.
    // Sinasabi nito sa TypeScript na siguradong may cookie value.
    const cookie = cookieFrom(login)!;

    const before = await getAs("/api/users/me", accessToken);
    expect(before.status).toBe(200);

    // I-send ang cookie para mag-logout.
    const logout = await post("/api/auth/logout").set("Cookie", cookie);
    expect(logout.status).toBe(200);

    // Subukang gamitin ulit ang dating access token.
    const after = await getAs("/api/users/me", accessToken);

    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe("SESSION_ENDED");
  });

  it("logout without a cookie still succeeds (idempotent)", async () => {
    const res = await post("/api/auth/logout");

    expect(res.status).toBe(200);
  });
});

describe("refresh token rotation", () => {
  it("refresh returns a NEW cookie and a working access token", async () => {
    await createVerifiedUser(EMAIL, PASSWORD);
    const login = await loginUser(EMAIL, PASSWORD);
    const cookie1 = cookieFrom(login)!;

    const refreshed = await post("/api/auth/refresh").set("Cookie", cookie1);

    expect(refreshed.status).toBe(200);

    // not.toBe() checks na magkaiba ang old at new cookie.
    expect(cookieFrom(refreshed)).not.toBe(cookie1);

    const me = await getAs("/api/users/me", refreshed.body.data.accessToken);
    expect(me.status).toBe(200);
  });

  it("refresh without a cookie is rejected", async () => {
    const res = await post("/api/auth/refresh");

    expect(res.status).toBe(401);
  });

  it("REUSING an old refresh token kills ALL sessions", async () => {
    await createVerifiedUser(EMAIL, PASSWORD);
    const login = await loginUser(EMAIL, PASSWORD);

    // Ituring muna natin ang cookie na ito bilang stolen token.
    const cookie1 = cookieFrom(login)!;

    // Normal refresh: magiging invalid na ang cookie1.
    const first = await post("/api/auth/refresh").set("Cookie", cookie1);
    const cookie2 = cookieFrom(first)!;

    // Subukan ng attacker na gamitin ulit ang lumang token.
    const replay = await post("/api/auth/refresh").set("Cookie", cookie1);

    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("REFRESH_TOKEN_REUSED");

    // Dapat invalid na rin ang bagong token dahil may detected reuse.
    const afterTheft = await post("/api/auth/refresh").set("Cookie", cookie2);
    expect(afterTheft.status).toBe(401);

    // Dapat hindi na rin gumana ang dating access token.
    const me = await getAs("/api/users/me", first.body.data.accessToken);

    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe("SESSION_ENDED");
  });
});

describe("account lockout", () => {
  it("locks after 5 wrong passwords, even for the RIGHT password", async () => {
    await createVerifiedUser(EMAIL, PASSWORD);

    for (let i = 0; i < 5; i++) {
      const res = await loginUser(EMAIL, WRONG_PASSWORD);
      expect(res.status).toBe(401);
    }

    // Kahit tama ang password, dapat locked pa rin ang account.
    const locked = await loginUser(EMAIL, PASSWORD);

    expect(locked.status).toBe(401);
    expect(locked.body.error.code).toBe("INVALID_CREDENTIALS");

    // Kunin ang locked_until value mula sa database.
    // Check kung na-update ang failed attempts at account lock.
    const { rows } = await query<{ locked_until: Date | null }>(
      "SELECT locked_until FROM users WHERE email = $1",
      [EMAIL]
    );

    // Dapat may expiration time ang account lock.
    expect(rows[0].locked_until).not.toBeNull();
  });

  it("works again once the lock has expired", async () => {
    await createVerifiedUser(EMAIL, PASSWORD);

    // Mag-login gamit ang maling password nang 5 beses.
    for (let i = 0; i < 5; i++) {
      await loginUser(EMAIL, WRONG_PASSWORD);
    }

    // Gawing expired ang lock para kunwari lumipas na ang 16 minutes.
    await query(
      "UPDATE users SET locked_until = NOW() - INTERVAL '1 minute' WHERE email = $1",
      [EMAIL]
    );

    // Dapat makapag-login na ulit gamit ang tamang password.
    const res = await loginUser(EMAIL, PASSWORD);

    expect(res.status).toBe(200);
  });

  
});