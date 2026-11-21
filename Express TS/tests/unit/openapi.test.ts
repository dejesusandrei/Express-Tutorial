import SwaggerParser from "@apidevtools/swagger-parser";
import { describe, expect, it } from "vitest";

import { openApiSpec } from "../../src/docs/openapi.js";

/**
 * ============================================================================
 * Testing the API documentation
 * ============================================================================
 * Documentation rots: someone adds a route, forgets the docs, and a month
 * later the menu describes dishes that no longer exist. These tests can't
 * check that every sentence is true, but they catch the common problems:
 *   - the document is not valid OpenAPI (Swagger UI would show a red error)
 *   - an endpoint lost its success answer or its 401
 *   - a secret or an internal field slipped into the docs
 * ============================================================================
 */

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

type Operation = {
  tags?: string[];
  operationId?: string;
  summary?: string;
  security?: unknown[];
  responses?: Record<string, unknown>;
};

// Flatten the document into a list: { method, path, operation }.
const operations = (): { method: string; path: string; operation: Operation }[] =>
  Object.entries(openApiSpec.paths).flatMap(([path, item]) =>
    METHODS.filter((method) => method in item).map((method) => ({
      method,
      path,
      operation: (item as Record<string, Operation>)[method],
    }))
  );

describe("the document is valid OpenAPI", () => {
  it("passes the official validator (all $refs resolve, schemas are legal)", async () => {
    // validate() rewrites the object it receives, so give it a copy.
    const copy = structuredClone(openApiSpec);

    await expect(SwaggerParser.validate(copy as never)).resolves.toBeDefined();
  });
});

describe("every endpoint is documented properly", () => {
  it("has a summary, a tag, and a unique operationId", () => {
    const ids = operations().map(({ operation }) => operation.operationId);

    for (const { method, path, operation } of operations()) {
      expect(operation.summary, `${method} ${path} summary`).toBeTruthy();
      expect(operation.tags?.length, `${method} ${path} tags`).toBeGreaterThan(0);
      expect(operation.operationId, `${method} ${path} operationId`).toBeTruthy();
    }

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares a success answer (2xx)", () => {
    for (const { method, path, operation } of operations()) {
      const codes = Object.keys(operation.responses ?? {});

      expect(
        codes.some((code) => code.startsWith("2")),
        `${method} ${path}`
      ).toBe(true);
    }
  });

  it("documents 401 for every endpoint that needs a Bearer token", () => {
    // Cookie endpoints are different: /logout never returns 401 on purpose
    // (it is idempotent), and /refresh documents its own 401 codes.
    for (const { method, path, operation } of operations()) {
      const usesBearer = JSON.stringify(operation.security ?? []).includes(
        "bearerAuth"
      );

      if (usesBearer) {
        expect(
          Object.keys(operation.responses ?? {}),
          `${method} ${path}`
        ).toContain("401");
      }
    }
  });

  it("documents 429 for every /api/auth endpoint (they are rate limited)", () => {
    for (const { method, path, operation } of operations()) {
      if (path.startsWith("/api/auth/")) {
        expect(
          Object.keys(operation.responses ?? {}),
          `${method} ${path}`
        ).toContain("429");
      }
    }
  });

  it("documents every endpoint the app is known to have", () => {
    const documented = operations().map(({ method, path }) => `${method} ${path}`);

    const expected = [
      "post /api/auth/register",
      "post /api/auth/login",
      "post /api/auth/refresh",
      "post /api/auth/logout",
      "post /api/auth/forgot-password",
      "post /api/auth/reset-password",
      "post /api/auth/verify-email",
      "post /api/auth/resend-verification",
      "get /api/users/me",
      "get /api/users",
      "get /api/users/{id}",
      "delete /api/users/{id}",
      "get /api/tasks",
      "post /api/tasks",
      "get /api/tasks/{id}",
      "put /api/tasks/{id}",
      "delete /api/tasks/{id}",
      "get /api/health",
      "get /api/health/ready",
    ];

    for (const entry of expected) {
      expect(documented).toContain(entry);
    }
  });
});

describe("the document never leaks secrets or internals", () => {
  const text = JSON.stringify(openApiSpec);

  it("does not mention internal fields", () => {
    expect(text).not.toContain("password_hash");
    expect(text).not.toContain("failed_login_attempts");
    expect(text).not.toContain("locked_until");
  });

  it("does not contain a real-looking JWT or password hash", () => {
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./); // a JWT starts like this
    expect(text).not.toContain("$argon2");
  });

  it("the User schema only lists public fields", () => {
    const user = openApiSpec.components.schemas.User;

    expect(Object.keys(user.properties).sort()).toEqual(
      ["created_at", "email", "email_verified_at", "id", "name", "role"].sort()
    );
  });
});