import { describe, expect, it } from "vitest";

import { get } from "../helpers/http.js";

/**
 * ============================================================================
 * INTEGRATION TESTS: the docs routes
 * ============================================================================
 * In the test environment the docs are ON (the default outside production).
 * Whether they are OFF in production is checked in env.test.ts.
 * ============================================================================
 */

describe("API docs (development and test)", () => {
  it("serves the raw OpenAPI document as JSON", async () => {
    const res = await get("/api/docs/openapi.json");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.body.openapi).toBe("3.0.3");
    expect(Object.keys(res.body.paths)).toContain("/api/auth/login");
  });

  it("serves the Swagger UI page", async () => {
    const res = await get("/api/docs/");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("the served document never contains password hashes", async () => {
    const res = await get("/api/docs/openapi.json");

    expect(JSON.stringify(res.body)).not.toContain("password_hash");
  });
});

describe("the strict security headers stay strict everywhere else", () => {
  // The docs page needs a looser Content-Security-Policy to load Swagger UI.
  // That exception must stay on /api/docs ONLY.
  it("normal API routes still send a strict CSP", async () => {
    const res = await get("/api/health");

    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
  });

  it("a normal API route does not get the relaxed docs setup", async () => {
    const res = await get("/api/health");

    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});