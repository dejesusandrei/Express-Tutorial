/**
 * ============================================================================
 * openapi.ts : the API's MENU
 * ============================================================================
 * A restaurant menu tells you what dishes exist, what you must tell the waiter
 * (the order), and what you get back. An OpenAPI document does the same for an
 * API: which endpoints exist, what to send, what comes back, and which errors
 * to expect.
 *
 * Swagger UI turns this document into a web page where you can read AND try
 * every endpoint.
 *
 * RULES FOR WRITING IT
 *  - Never put real secrets in examples (tokens, passwords, hashes). Use
 *    placeholders like "<access-token>".
 *  - Document only what the API really returns. A wrong menu is worse than
 *    none. When you change a route, change this file in the SAME commit.
 *  - Never describe internal fields (password_hash, failed_login_attempts,
 *    locked_until). They never leave the server.
 * ============================================================================
 */

type Json = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Small helpers, so each endpoint below stays short and readable
// ---------------------------------------------------------------------------
const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });

const responseRef = (name: string): Json => ({
  $ref: `#/components/responses/${name}`,
});

const json = (schema: Json, example?: unknown): Json => ({
  "application/json": {
    schema,
    ...(example !== undefined ? { example } : {}),
  },
});

// Every successful answer is wrapped as { success: true, data: ... }.
const successSchema = (data: Json): Json => ({
  type: "object",
  required: ["success", "data"],
  properties: { success: { type: "boolean", enum: [true] }, data },
});

const ok = (
  description: string,
  data: Json,
  example?: unknown,
  headers?: Json
): Json => ({
  description,
  ...(headers ? { headers } : {}),
  content: json(
    successSchema(data),
    example === undefined ? undefined : { success: true, data: example }
  ),
});

const messageData: Json = {
  type: "object",
  required: ["message"],
  properties: { message: { type: "string" } },
};

const ERROR_RESPONSE_NAMES: Record<string, string> = {
  "400": "BadRequest",
  "401": "Unauthorized",
  "403": "Forbidden",
  "404": "NotFound",
  "409": "Conflict",
  "413": "PayloadTooLarge",
  "429": "TooManyRequests",
  "503": "ServiceUnavailable",
};

// errors("400", "429") -> { "400": {$ref...}, "429": {$ref...} }
const errors = (...codes: string[]): Json =>
  Object.fromEntries(
    codes.map((code) => [code, responseRef(ERROR_RESPONSE_NAMES[code])])
  );

const operation = (o: {
  tag: string;
  id: string;
  summary: string;
  description?: string;
  body?: string; // name of the request body schema
  security?: "bearer" | "cookie";
  responses: Json;
}): Json => ({
  tags: [o.tag],
  operationId: o.id,
  summary: o.summary,
  ...(o.description ? { description: o.description } : {}),
  ...(o.body
    ? { requestBody: { required: true, content: json(ref(o.body)) } }
    : {}),
  ...(o.security
    ? {
        security: [
          o.security === "bearer" ? { bearerAuth: [] } : { refreshCookie: [] },
        ],
      }
    : {}),
  responses: o.responses,
});

const refreshCookieHeader: Json = {
  "Set-Cookie": {
    description:
      "The new refresh token, in an httpOnly cookie: " +
      "refreshToken=<value>; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=604800. " +
      "JavaScript cannot read it; the browser sends it back by itself.",
    schema: { type: "string" },
  },
};

const idParameter: Json = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------
export const openApiSpec = {
  openapi: "3.0.3",

  info: {
    title: "Express TS API",
    version: "1.0.0",
    description: [
      "Authentication and task API.",
      "",
      "**Answer format.** Success: `{ success: true, data }`. " +
        "Error: `{ success: false, error: { status, message, code } }`. " +
        "Always read `error.code`, not the message text.",
      "",
      "**Login.** `POST /api/auth/login` returns an access token (15 minutes). " +
        "Click **Authorize** and paste it to call protected endpoints. " +
        "The refresh token travels in an httpOnly cookie.",
      "",
      "**CSRF protection.** Every `POST` under `/api/auth` must come from the " +
        "frontend's origin (the `Origin` header). Browsers add it by themselves. " +
        "Other tools (Postman, curl) must send `Origin: <frontend URL>`.",
      "",
      "**Rate limits.** Over the limit you get `429` and a `Retry-After` header.",
      "",
      "**Request id.** Every response has an `X-Request-Id` header. Quote it " +
        "when you report a problem.",
    ].join("\n"),
  },

  // Relative URL: Swagger UI calls the same server that serves this page.
  servers: [{ url: "/" }],

  tags: [
    { name: "Auth", description: "Register, log in, tokens, passwords, email verification" },
    { name: "Users", description: "User accounts" },
    { name: "Tasks", description: "My tasks. You only ever see and change your OWN tasks." },
    { name: "Health", description: "Liveness and readiness checks" },
  ],

  paths: {
    // ------------------------------------------------------------------ AUTH
    "/api/auth/register": {
      post: operation({
        tag: "Auth",
        id: "register",
        summary: "Create an account",
        description:
          "Creates an UNVERIFIED account and sends a verification link by email. " +
          "The user cannot log in until the email is verified.",
        body: "RegisterRequest",
        responses: {
          "201": ok("Account created", { type: "object", properties: { user: ref("User") } }),
          ...errors("400", "403", "409", "413", "429"),
        },
      }),
    },

    "/api/auth/login": {
      post: operation({
        tag: "Auth",
        id: "login",
        summary: "Log in",
        description:
          "Wrong email, wrong password, and a locked account all return the SAME " +
          "401 INVALID_CREDENTIALS, on purpose. 5 wrong passwords in a row lock " +
          "the account for 15 minutes. `EMAIL_NOT_VERIFIED` (403) is returned " +
          "only after a correct password.",
        body: "LoginRequest",
        responses: {
          "200": ok(
            "Logged in",
            {
              type: "object",
              required: ["user", "accessToken"],
              properties: {
                user: ref("User"),
                accessToken: { type: "string", description: "JWT, valid for 15 minutes" },
              },
            },
            undefined,
            refreshCookieHeader
          ),
          ...errors("400", "401", "403", "429"),
        },
      }),
    },

    "/api/auth/refresh": {
      post: operation({
        tag: "Auth",
        id: "refresh",
        summary: "Get a new access token",
        description:
          "Uses the refresh cookie. The refresh token is ROTATED: the old one stops " +
          "working and a new cookie is set. Using an old token again (`REFRESH_TOKEN_REUSED`) " +
          "ends ALL sessions of that user.",
        security: "cookie",
        responses: {
          "200": ok(
            "New access token and a new refresh cookie",
            {
              type: "object",
              required: ["accessToken"],
              properties: { accessToken: { type: "string" } },
            },
            undefined,
            refreshCookieHeader
          ),
          ...errors("401", "403", "429"),
        },
      }),
    },

    "/api/auth/logout": {
      post: operation({
        tag: "Auth",
        id: "logout",
        summary: "Log out",
        description:
          "Ends the session and clears the cookie. Always returns 200, even if " +
          "there was no session. The access token stops working immediately.",
        security: "cookie",
        responses: {
          "200": ok("Logged out", messageData, { message: "Logged out successfully" }),
          ...errors("403", "429"),
        },
      }),
    },

    "/api/auth/forgot-password": {
      post: operation({
        tag: "Auth",
        id: "forgotPassword",
        summary: "Request a password reset link",
        description:
          "ALWAYS answers 200 with the same message, whether or not the email has " +
          "an account, so it cannot be used to discover registered emails.",
        body: "ForgotPasswordRequest",
        responses: {
          "200": ok("Request accepted", messageData, {
            message: "If an account exists for that email, a reset link has been sent.",
          }),
          ...errors("400", "403", "429"),
        },
      }),
    },

    "/api/auth/reset-password": {
      post: operation({
        tag: "Auth",
        id: "resetPassword",
        summary: "Choose a new password with a reset token",
        description:
          "The token comes from the emailed link. It works ONCE and expires in 30 " +
          "minutes. On success every session of the user is ended.",
        body: "ResetPasswordRequest",
        responses: {
          "200": ok("Password changed", messageData, {
            message: "Password updated. Please log in with your new password.",
          }),
          ...errors("400", "403", "429"),
        },
      }),
    },

    "/api/auth/verify-email": {
      post: operation({
        tag: "Auth",
        id: "verifyEmail",
        summary: "Verify an email address",
        description: "The token comes from the emailed link. It works ONCE and expires in 24 hours.",
        body: "VerifyEmailRequest",
        responses: {
          "200": ok("Email verified", messageData, {
            message: "Email verified. You can now log in.",
          }),
          ...errors("400", "403", "429"),
        },
      }),
    },

    "/api/auth/resend-verification": {
      post: operation({
        tag: "Auth",
        id: "resendVerification",
        summary: "Send the verification link again",
        description: "ALWAYS answers 200 with the same message, for any email.",
        body: "ResendVerificationRequest",
        responses: {
          "200": ok("Request accepted", messageData),
          ...errors("400", "403", "429"),
        },
      }),
    },

    // ----------------------------------------------------------------- USERS
    "/api/users/me": {
      get: operation({
        tag: "Users",
        id: "getCurrentUser",
        summary: "My own account",
        security: "bearer",
        responses: {
          "200": ok("The logged-in user", { type: "object", properties: { user: ref("User") } }),
          ...errors("401", "429"),
        },
      }),
    },

    "/api/users": {
      get: operation({
        tag: "Users",
        id: "listUsers",
        summary: "List all users (admin only)",
        description: "Never includes password hashes.",
        security: "bearer",
        responses: {
          "200": ok("All users", {
            type: "object",
            properties: { users: { type: "array", items: ref("User") } },
          }),
          ...errors("401", "403", "429"),
        },
      }),
    },

    "/api/users/{id}": {
      parameters: [idParameter],

      get: operation({
        tag: "Users",
        id: "getUserById",
        summary: "One user by id (admin only)",
        security: "bearer",
        responses: {
          "200": ok("The user", { type: "object", properties: { user: ref("User") } }),
          ...errors("400", "401", "403", "404", "429"),
        },
      }),

      delete: operation({
        tag: "Users",
        id: "deleteUser",
        summary: "Delete a user (admin only)",
        security: "bearer",
        responses: {
          "200": ok("User deleted", { type: "object" }),
          ...errors("400", "401", "403", "404", "429"),
        },
      }),
    },

    // ----------------------------------------------------------------- TASKS
    "/api/tasks": {
      get: {
        ...operation({
          tag: "Tasks",
          id: "listMyTasks",
          summary: "My tasks, newest first (paginated)",
          description:
            "Returns only YOUR tasks. `pagination` sits next to `data`, not inside it. " +
            "The server enforces a maximum `limit`.",
          security: "bearer",
          responses: {
            "200": {
              description: "One page of my tasks",
              content: json({
                type: "object",
                required: ["success", "data", "pagination"],
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    required: ["tasks"],
                    properties: { tasks: { type: "array", items: ref("Task") } },
                  },
                  pagination: ref("Pagination"),
                },
              }),
            },
            ...errors("400", "401", "429"),
          },
        }),
        parameters: [
          {
            name: "page",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            description: "Items per page. The server enforces a maximum.",
            schema: { type: "integer", minimum: 1 },
          },
        ],
      },

      post: operation({
        tag: "Tasks",
        id: "createTask",
        summary: "Create a task",
        description: "The owner is always the logged-in user. An `owner_id` in the body is ignored.",
        body: "TaskCreateRequest",
        security: "bearer",
        responses: {
          "201": ok("Task created", { type: "object", properties: { task: ref("Task") } }),
          ...errors("400", "401", "413", "429"),
        },
      }),
    },

    "/api/tasks/{id}": {
      parameters: [idParameter],

      get: operation({
        tag: "Tasks",
        id: "getTaskById",
        summary: "One of my tasks",
        description: "A task that belongs to someone else answers 404, as if it did not exist.",
        security: "bearer",
        responses: {
          "200": ok("The task", { type: "object", properties: { task: ref("Task") } }),
          ...errors("400", "401", "404", "429"),
        },
      }),

      put: operation({
        tag: "Tasks",
        id: "updateTask",
        summary: "Replace one of my tasks",
        description: "Both `title` and `completed` are required. A task of someone else answers 404.",
        body: "TaskUpdateRequest",
        security: "bearer",
        responses: {
          "200": ok("The updated task", { type: "object", properties: { task: ref("Task") } }),
          ...errors("400", "401", "404", "413", "429"),
        },
      }),

      delete: operation({
        tag: "Tasks",
        id: "deleteTask",
        summary: "Delete one of my tasks",
        description: "Returns the deleted task. A task of someone else answers 404.",
        security: "bearer",
        responses: {
          "200": ok("The deleted task", { type: "object", properties: { task: ref("Task") } }),
          ...errors("400", "401", "404", "429"),
        },
      }),
    },

    // ---------------------------------------------------------------- HEALTH
    "/api/health": {
      get: operation({
        tag: "Health",
        id: "liveness",
        summary: "Is the process running? (liveness)",
        responses: {
          "200": {
            description: "Alive",
            content: json(
              { type: "object", properties: { status: { type: "string", enum: ["ok"] } } },
              { status: "ok" }
            ),
          },
        },
      }),
    },

    "/api/health/ready": {
      get: operation({
        tag: "Health",
        id: "readiness",
        summary: "Can it do its job? Checks the database (readiness)",
        responses: {
          "200": {
            description: "Ready",
            content: json(
              {
                type: "object",
                properties: {
                  status: { type: "string", enum: ["ok"] },
                  database: { type: "string", enum: ["up"] },
                },
              },
              { status: "ok", database: "up" }
            ),
          },
          "503": {
            description: "The database is not reachable",
            content: json(
              {
                type: "object",
                properties: {
                  status: { type: "string", enum: ["unavailable"] },
                  database: { type: "string", enum: ["down"] },
                },
              },
              { status: "unavailable", database: "down" }
            ),
          },
        },
      }),
    },
  },

  // ------------------------------------------------------------- COMPONENTS
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "The access token from /api/auth/login. Valid for 15 minutes.",
      },
      refreshCookie: {
        type: "apiKey",
        in: "cookie",
        name: "refreshToken",
        description:
          "httpOnly cookie set by /login and /refresh. The browser sends it " +
          "automatically to /api/auth/*.",
      },
    },

    schemas: {
      ApiError: {
        type: "object",
        required: ["success", "error"],
        properties: {
          success: { type: "boolean", enum: [false] },
          error: {
            type: "object",
            required: ["status", "message", "code"],
            properties: {
              status: { type: "integer", example: 401 },
              message: { type: "string" },
              code: { type: "string", description: "Stable machine-readable code. Use this, not the message." },
              details: { description: "Extra information, for example which fields are invalid." },
              requestId: { type: "string", format: "uuid", description: "Only on 500 errors." },
            },
          },
        },
      },

      // Only the fields that are allowed to leave the server.
      User: {
        type: "object",
        required: ["id", "name", "email", "role", "created_at", "email_verified_at"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          role: { type: "string", enum: ["user", "admin"] },
          created_at: { type: "string", format: "date-time" },
          email_verified_at: { type: "string", format: "date-time", nullable: true },
        },
      },

      Task: {
        type: "object",
        required: ["id", "owner_id", "title", "completed", "created_at"],
        properties: {
          id: { type: "string", format: "uuid" },
          owner_id: { type: "string", format: "uuid" },
          title: { type: "string" },
          completed: { type: "boolean" },
          created_at: { type: "string", format: "date-time" },
        },
      },

      Pagination: {
        type: "object",
        required: ["currentPage", "limit", "totalItems", "totalPages"],
        properties: {
          currentPage: { type: "integer", example: 1 },
          limit: { type: "integer", example: 10 },
          totalItems: { type: "integer", example: 23 },
          totalPages: { type: "integer", example: 3 },
        },
      },

      // Title limits must match TITLE_MIN / TITLE_MAX in schema/task.schema.ts.
      TaskCreateRequest: {
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string", minLength: 2, maxLength: 100, example: "Buy rice" },
          completed: { type: "boolean", default: false },
        },
      },

      TaskUpdateRequest: {
        type: "object",
        required: ["title", "completed"],
        properties: {
          title: { type: "string", minLength: 2, maxLength: 100, example: "Buy rice and eggs" },
          completed: { type: "boolean" },
        },
      },

      RegisterRequest: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 100, example: "Juan Dela Cruz" },
          email: { type: "string", format: "email", maxLength: 254, example: "juan@example.com" },
          password: {
            type: "string",
            minLength: 10,
            maxLength: 128,
            description: "10 to 128 characters. Common passwords are rejected.",
            example: "<your-password>",
          },
        },
      },

      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", example: "juan@example.com" },
          password: { type: "string", minLength: 1, maxLength: 128, example: "<your-password>" },
        },
      },

      ForgotPasswordRequest: {
        type: "object",
        required: ["email"],
        properties: { email: { type: "string", format: "email", example: "juan@example.com" } },
      },

      ResetPasswordRequest: {
        type: "object",
        required: ["token", "password"],
        properties: {
          token: { type: "string", pattern: "^[a-f0-9]{64}$", description: "From the emailed link." },
          password: { type: "string", minLength: 10, maxLength: 128, example: "<new-password>" },
        },
      },

      VerifyEmailRequest: {
        type: "object",
        required: ["token"],
        properties: {
          token: { type: "string", pattern: "^[a-f0-9]{64}$", description: "From the emailed link." },
        },
      },

      ResendVerificationRequest: {
        type: "object",
        required: ["email"],
        properties: { email: { type: "string", format: "email", example: "juan@example.com" } },
      },
    },

    // Reusable error answers, referenced from every endpoint.
    responses: {
      BadRequest: {
        description: "Invalid input (validation failed, bad JSON, or a malformed id)",
        content: json(ref("ApiError"), {
          success: false,
          error: { status: 400, message: "Invalid input", code: "INVALID_INPUT" },
        }),
      },
      Unauthorized: {
        description:
          "Not logged in, or the token is bad. Codes: AUTH_REQUIRED, INVALID_TOKEN, " +
          "TOKEN_EXPIRED (call /refresh), SESSION_ENDED, INVALID_CREDENTIALS, " +
          "INVALID_REFRESH_TOKEN, REFRESH_TOKEN_REUSED",
        content: json(ref("ApiError"), {
          success: false,
          error: { status: 401, message: "Authentication required", code: "AUTH_REQUIRED" },
        }),
      },
      Forbidden: {
        description:
          "Not allowed. Codes: ORIGIN_REQUIRED and INVALID_ORIGIN (CSRF check), " +
          "EMAIL_NOT_VERIFIED, or the role is not enough",
        content: json(ref("ApiError"), {
          success: false,
          error: { status: 403, message: "Invalid request origin", code: "INVALID_ORIGIN" },
        }),
      },
      NotFound: {
        description: "Not found",
        content: json(ref("ApiError")),
      },
      Conflict: {
        description: "Already exists (for example EMAIL_ALREADY_EXISTS)",
        content: json(ref("ApiError"), {
          success: false,
          error: { status: 409, message: "Email already exists", code: "EMAIL_ALREADY_EXISTS" },
        }),
      },
      PayloadTooLarge: {
        description: "The request body is larger than 10 kB",
        content: json(ref("ApiError"), {
          success: false,
          error: { status: 413, message: "Request body is too large", code: "PAYLOAD_TOO_LARGE" },
        }),
      },
      TooManyRequests: {
        description: "Rate limit reached. The Retry-After header says how many seconds to wait.",
        headers: {
          "Retry-After": { description: "Seconds to wait", schema: { type: "integer" } },
        },
        content: json(ref("ApiError"), {
          success: false,
          error: { status: 429, message: "Too many requests. Please slow down.", code: "TOO_MANY_REQUESTS" },
        }),
      },
      ServiceUnavailable: {
        description: "The database is slow or unreachable. Try again later.",
        content: json(ref("ApiError"), {
          success: false,
          error: { status: 503, message: "Service temporarily unavailable", code: "DATABASE_UNAVAILABLE" },
        }),
      },
    },
  },
};