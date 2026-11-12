
import { describe, expect, it } from "vitest";

import { createLogger } from "../../src/utils/logger.js";

// Gumagawa ng logger na sa array magsa-save ng logs instead na sa terminal.
const capture = () => {
  const lines: string[] = [];

  const logger = createLogger({
    level: "info",
    destination: {
      write: (message: string) => {
        lines.push(message);
      },
    },
  });

  // Ibinabalik ang logger at captured logs para magamit sa tests.
  return { logger, lines, output: () => lines.join("") };
};

describe("logger redaction", () => {
  it("hides passwords", () => {
    const { logger, output } = capture();

    logger.info({ password: "hunter2-super-secret" }, "login attempt");

    // Tinitiyak na hindi makikita ang actual password sa logs.
    expect(output()).not.toContain("hunter2-super-secret");
    expect(output()).toContain("[REDACTED]");
  });

  it("hides a password hash inside a nested object", () => {
    const { logger, output } = capture();

    logger.info({ user: { password_hash: "$argon2id$v=19$secret" } }, "user");

    // Tinitiyak na pati password hash sa loob ng nested object ay nakatago.
    expect(output()).not.toContain("$argon2id");
  });

  it("hides access and refresh tokens", () => {
    const { logger, output } = capture();

    logger.info(
      { accessToken: "access-secret-111", refreshToken: "refresh-secret-222" },
      "tokens"
    );

    // Tinitiyak na hindi nailalabas ang access at refresh tokens.
    expect(output()).not.toContain("access-secret-111");
    expect(output()).not.toContain("refresh-secret-222");
  });

  it("hides the Authorization header and cookies of a request", () => {
    const { logger, output } = capture();

    logger.info(
      {
        req: {
          headers: {
            authorization: "Bearer eyJ.secret.jwt",
            cookie: "refreshToken=cookie-secret-333",
          },
        },
      },
      "request"
    );

    // Tinitiyak na nakatago ang authorization header at cookies.
    expect(output()).not.toContain("eyJ.secret.jwt");
    expect(output()).not.toContain("cookie-secret-333");
  });

  it("keeps normal fields so the log is still useful", () => {
    const { logger, output } = capture();

    logger.warn(
      { event: "auth.login_failed", reason: "bad_password", userId: "u-1" },
      "Login failed"
    );

    // Tinitiyak na hindi tinatanggal ang normal fields na kailangan sa debugging.
    expect(output()).toContain("auth.login_failed");
    expect(output()).toContain("bad_password");
    expect(output()).toContain("u-1");
  });
});

describe("logger and user input", () => {
  it("cannot be tricked into writing a fake log line (log injection)", () => {
    const { logger, lines } = capture();

    // Simulates input na may newline at pekeng log entry.
    const evil = 'Juan\n{"level":60,"msg":"SYSTEM COMPROMISED"}';

    logger.info({ name: evil }, "register");

    // Tinitiyak na isang log line lang ang magagawa kahit may newline sa input.
    expect(lines).toHaveLength(1);
    expect(lines[0].trim().split("\n")).toHaveLength(1);
  });
});
