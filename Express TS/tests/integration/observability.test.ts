
import { describe, expect, it } from "vitest";

import { get, post } from "../helpers/http.js";

// Regex para i-check kung valid UUID format ang request ID.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("request id", () => {
  it("every response carries an X-Request-Id", async () => {
    const res = await get("/api/health");

    // Tinitiyak na may valid request ID ang bawat response.
    expect(res.headers["x-request-id"]).toMatch(UUID);
  });

  it("every request gets a DIFFERENT id", async () => {
    const first = await get("/api/health");
    const second = await get("/api/health");

    // Tinitiyak na unique ang request ID sa bawat request.
    expect(first.headers["x-request-id"]).not.toBe(
      second.headers["x-request-id"]
    );
  });

  it("ignores a request id sent by the client (they could forge it)", async () => {
    const res = await get("/api/health").set("X-Request-Id", "attacker-chosen");

    // Hindi dapat gamitin ang request ID na pinadala ng client.
    expect(res.headers["x-request-id"]).not.toBe("attacker-chosen");
  });
});

describe("bad input fails safely", () => {
  it("broken JSON returns 400 INVALID_JSON, not a 500", async () => {
    const res = await post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{ this is not json");

    // Tinitiyak na 400 ang response kapag invalid ang JSON.
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("the error response never contains a stack trace or file path", async () => {
    const res = await post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{ this is not json");

    const body = JSON.stringify(res.body);

    // Hindi dapat makita ng client ang internal error details.
    expect(body).not.toContain("SyntaxError");
    expect(body).not.toContain("node_modules");
    expect(body).not.toMatch(/\bat\s.+\(.+:\d+:\d+\)/); // Example ng stack trace.
  });

  it("a huge request body is rejected with 413 (needs express.json limit)", async () => {
    const res = await post("/api/auth/login").send({
      email: "a".repeat(50_000),
      password: "x",
    });

    // Tinitiyak na nare-reject ang request kapag lumampas sa body size limit.
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("health checks", () => {
  it("liveness: GET /api/health", async () => {
    const res = await get("/api/health");

    // Chine-check kung tumatakbo at nakakasagot ang application.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("readiness: GET /api/health/ready checks the database", async () => {
    const res = await get("/api/health/ready");

    // Chine-check kung ready ang application at connected ang database.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", database: "up" });
  });
});
