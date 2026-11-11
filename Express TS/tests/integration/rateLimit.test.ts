
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetDatabase } from "../helpers/db.js";
import { clearOutbox } from "../helpers/emailOutbox.js";
import { createVerifiedUser, loginUser, post } from "../helpers/http.js";

// Mock natin ang email service para hindi totoong email ang ipadala.
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
 * INTEGRATION TESTS: RATE LIMITING
 * ============================================================================
 *
 * Sa ibang test files, naka-OFF ang rate limiting para hindi maapektuhan
 * ang ibang tests ng request limit.
 *
 * Dito naman, naka-ON ang rate limiting para ma-test natin kung gumagana
 * ang limit sa bawat endpoint.
 *
 * Note: Ang rate limiter ay may sariling request counter. Hindi ito
 * automatic na nare-reset pagkatapos ng bawat test.
 * Kaya gumagamit tayo ng magkakaibang limiter para sa bawat scenario.
 * ============================================================================
 */

// Test account na gagamitin sa login test.
const EMAIL = "juan@example.com";
const PASSWORD = "correct-horse-battery";

// Bago magsimula ang tests, i-ON ang rate limiting.
beforeAll(() => {
  process.env.DISABLE_RATE_LIMIT = "false";
});

// Pagkatapos ng lahat ng tests, ibalik sa OFF ang rate limiting.
afterAll(() => {
  process.env.DISABLE_RATE_LIMIT = "true";
});

// Tatakbo ito bago ang bawat test.
beforeEach(async () => {
  // Linisin ang database para walang data na maiwan mula sa previous test.
  await resetDatabase();

  // Linisin ang mga mock email na na-save sa outbox.
  clearOutbox();

  // Pansamantalang patahimikin ang console.error para hindi magulo ang test output.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("rate limiting", () => {
  it("login: the 6th failed attempt from one IP gets 429", async () => {
    // Gumawa muna ng verified user para may account na susubukan nating i-login.
    await createVerifiedUser(EMAIL, PASSWORD);

    // Ulitin nang 5 beses ang login gamit ang maling password.
    // Expected na 401 dahil incorrect ang password.
    for (let i = 0; i < 5; i++) {
      const res = await loginUser(EMAIL, "wrong-password-999");

      expect(res.status).toBe(401);
    }

    // Ika-6 na request na ito.
    // Dapat ma-block na ng rate limiter bago pa ma-check ang password.
    const blocked = await loginUser(EMAIL, "wrong-password-999");

    // 429 means Too Many Requests: naabot na ang request limit.
    expect(blocked.status).toBe(429);

    // Siguraduhin na tama ang error code na ibinalik ng API.
    expect(blocked.body.error.code).toBe("TOO_MANY_REQUESTS");

    // Dapat may Retry-After header na nagsasabi kung kailan puwedeng mag-request ulit.
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("forgot-password: the 4th request in an hour gets 429 (email bombing)", async () => {
    // Mag-send ng 3 forgot-password requests.
    // Expected na 200 para hindi malaman kung registered ang email o hindi.
    for (let i = 0; i < 3; i++) {
      const res = await post("/api/auth/forgot-password").send({
        email: EMAIL,
      });

      expect(res.status).toBe(200);
    }

    // Ang ika-4 na request ay dapat ma-block dahil naabot na ang limit.
    const blocked = await post("/api/auth/forgot-password").send({
      email: EMAIL,
    });

    // Siguraduhin na 429 ang response kapag sobra na ang requests.
    expect(blocked.status).toBe(429);

    // Siguraduhin na tama ang error code para sa rate limit.
    expect(blocked.body.error.code).toBe("TOO_MANY_REQUESTS");
  });
});
