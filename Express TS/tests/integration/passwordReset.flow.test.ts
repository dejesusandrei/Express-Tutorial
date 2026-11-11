
import { beforeEach, describe, expect, it, vi } from "vitest";

import { query } from "../../src/utils/databaseQueryHelper.js";
import { resetDatabase } from "../helpers/db.js";
import { clearOutbox, outbox } from "../helpers/emailOutbox.js";
import {
  createVerifiedUser,
  getAs,
  loginUser,
  post,
  tokenFromLink,
} from "../helpers/http.js";

// I-mock ang email service para hindi totoong email ang ipadala.
// Sa halip, ise-save lang ang email details sa outbox para magamit sa tests.
vi.mock("../../src/services/email.service.js", async () => {
  const { outbox } = await import("../helpers/emailOutbox.js");

  return {
    sendVerificationEmail: async (to: string, link: string) => {
      outbox.verification.push({ to, link });
    },
    sendPasswordResetEmail: async (to: string, link: string) => {
      outbox.reset.push({ to, link });
    },
  };
});

/**
 * ============================================================================
 * INTEGRATION TESTS: PASSWORD RESET
 * ============================================================================
 *
 * Dito natin tine-test ang buong password reset process:
 *
 * 1. Humingi ng password reset link gamit ang forgot-password.
 * 2. Kunin ang link mula sa mock email.
 * 3. Gamitin ang token para mag-set ng bagong password.
 * 4. Siguraduhing nagbago ang password at hindi na gumagana ang old sessions.
 *
 * Tine-test din natin kung expired, reused, o invalid ang reset token.
 * ============================================================================
 */

// Test account at mga password na gagamitin sa password reset tests.
const EMAIL = "juan@example.com";
const OLD_PASSWORD = "correct-horse-battery";
const NEW_PASSWORD = "brand-new-password-42";

// Tatakbo ito bago ang bawat test para malinis ang test environment.
beforeEach(async () => {
  // Linisin ang database para walang data na maiwan mula sa previous test.
  await resetDatabase();

  // Burahin ang mga mock email na na-save sa outbox.
  clearOutbox();

  // Patahimikin muna ang console.error para hindi magulo ang test output.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("forgot-password", () => {
  it("gives the SAME answer for a known and an unknown email", async () => {
    // Gumawa ng verified account na gagamitin sa test.
    await createVerifiedUser(EMAIL, OLD_PASSWORD);

    // Humingi ng password reset para sa existing account.
    const known = await post("/api/auth/forgot-password").send({
      email: EMAIL,
    });

    // Humingi rin ng password reset gamit ang email na hindi registered.
    const unknown = await post("/api/auth/forgot-password").send({
      email: "nobody@example.com",
    });

    // Parehong 200 ang response para hindi malaman ng iba
    // kung registered ba ang isang email o hindi.
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);

    // Dapat pareho ang response body ng existing at unknown email.
    expect(known.body).toEqual(unknown.body);

    // Pero ang existing account lang ang dapat makatanggap ng reset email.
    expect(outbox.reset).toHaveLength(1);

    // Siguraduhing sa tamang email ipinadala ang reset link.
    expect(outbox.reset[0].to).toBe(EMAIL);
  });

  it("stores only a HASH of the token, never the token", async () => {
    // Gumawa ng verified account.
    await createVerifiedUser(EMAIL, OLD_PASSWORD);

    // Mag-request ng password reset link.
    await post("/api/auth/forgot-password").send({ email: EMAIL });

    // Kunin ang raw token mula sa link na na-save sa mock email.
    const token = tokenFromLink(outbox.reset[0].link);

    // Kunin ang token_hash na naka-save sa database.
    // Ang { token_hash: string } ay nagsasabi sa TypeScript
    // na string ang expected na laman ng token_hash.
    const { rows } = await query<{ token_hash: string }>(
      "SELECT token_hash FROM password_reset_tokens"
    );

    // Dapat may isang reset token record sa database.
    expect(rows).toHaveLength(1);

    // Siguraduhing hash ang naka-save at hindi ang original token.
    expect(rows[0].token_hash).not.toBe(token);
  });
});

describe("reset-password", () => {
  it("changes the password, works once, and ends all old sessions", async () => {
    // Gumawa ng verified account.
    await createVerifiedUser(EMAIL, OLD_PASSWORD);

    // Mag-login gamit ang old password para magkaroon ng active session.
    const oldLogin = await loginUser(EMAIL, OLD_PASSWORD);

    // Kunin ang access token ng existing session.
    const oldAccessToken = oldLogin.body.data.accessToken;

    // Humingi ng password reset link.
    await post("/api/auth/forgot-password").send({ email: EMAIL });

    // Kunin ang reset token mula sa mock email.
    const token = tokenFromLink(outbox.reset[0].link);

    // Gamitin ang token para palitan ang password.
    const reset = await post("/api/auth/reset-password").send({
      token,
      password: NEW_PASSWORD,
    });

    // Dapat successful ang password reset.
    expect(reset.status).toBe(200);

    // 1. Dapat hindi na gumana ang old session pagkatapos mag-reset.
    // Kahit hindi pa expired ang access token, dapat revoked na ito.
    const me = await getAs("/api/users/me", oldAccessToken);

    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe("SESSION_ENDED");

    // 2. Hindi na dapat gumana ang old password.
    expect((await loginUser(EMAIL, OLD_PASSWORD)).status).toBe(401);

    // Dapat makapag-login na gamit ang bagong password.
    expect((await loginUser(EMAIL, NEW_PASSWORD)).status).toBe(200);

    // 3. Subukang gamitin ulit ang parehong reset token.
    // Dapat rejected dahil one-time use lang ang reset link.
    const replay = await post("/api/auth/reset-password").send({
      token,
      password: "another-password-77",
    });

    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe("INVALID_RESET_TOKEN");
  });

  it("a weak new password is rejected WITHOUT burning the link", async () => {
    // Gumawa ng verified account.
    await createVerifiedUser(EMAIL, OLD_PASSWORD);

    // Humingi ng password reset link.
    await post("/api/auth/forgot-password").send({ email: EMAIL });

    // Kunin ang token mula sa reset link.
    const token = tokenFromLink(outbox.reset[0].link);

    // Subukang gumamit ng weak password.
    const weak = await post("/api/auth/reset-password").send({
      token,
      password: "short",
    });

    // Dapat rejected dahil hindi pasado sa password validation.
    expect(weak.status).toBe(400);

    // Subukang gamitin ulit ang parehong token pero valid na password.
    // Dapat gumana pa rin dahil hindi dapat na-consume ang token
    // noong unang attempt na weak password ang ginamit.
    const good = await post("/api/auth/reset-password").send({
      token,
      password: NEW_PASSWORD,
    });

    expect(good.status).toBe(200);
  });

  it("only the NEWEST link works", async () => {
    // Gumawa ng verified account.
    await createVerifiedUser(EMAIL, OLD_PASSWORD);

    // Humingi ng dalawang reset links.
    // Ang pangalawang request ang gagawa ng newest link.
    await post("/api/auth/forgot-password").send({ email: EMAIL });
    await post("/api/auth/forgot-password").send({ email: EMAIL });

    // Kunin ang first at second reset tokens mula sa mock emails.
    const oldToken = tokenFromLink(outbox.reset[0].link);
    const newToken = tokenFromLink(outbox.reset[1].link);

    // Subukang gamitin ang luma nang reset token.
    const oldTry = await post("/api/auth/reset-password").send({
      token: oldToken,
      password: NEW_PASSWORD,
    });

    // Dapat rejected na ang old token dahil may mas bagong link na.
    expect(oldTry.status).toBe(400);

    // Subukang gamitin ang pinakabagong reset token.
    const newTry = await post("/api/auth/reset-password").send({
      token: newToken,
      password: NEW_PASSWORD,
    });

    // Dapat successful ang newest token.
    expect(newTry.status).toBe(200);
  });

  it("an expired link is rejected", async () => {
    // Gumawa ng verified account.
    await createVerifiedUser(EMAIL, OLD_PASSWORD);

    // Humingi ng password reset link.
    await post("/api/auth/forgot-password").send({ email: EMAIL });

    // Kunin ang reset token.
    const token = tokenFromLink(outbox.reset[0].link);

    // Baguhin ang expiration date sa database para maging expired na.
    // NOW() = current date and time.
    await query(
      "UPDATE password_reset_tokens SET expires_at = NOW() - INTERVAL '1 minute'"
    );

    // Subukang gamitin ang expired reset token.
    const res = await post("/api/auth/reset-password").send({
      token,
      password: NEW_PASSWORD,
    });

    // Dapat rejected ang expired link.
    expect(res.status).toBe(400);
  });

  it("rejects a token that was never issued", async () => {
    // Gumamit ng random token na hindi galing sa reset email.
    // "a".repeat(64) creates a string containing 64 letter a's.
    const res = await post("/api/auth/reset-password").send({
      token: "a".repeat(64),
      password: NEW_PASSWORD,
    });

    // Dapat rejected dahil walang ganitong token sa database.
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_RESET_TOKEN");
  });
});
