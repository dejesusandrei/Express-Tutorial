// ============================================================================
// scripts/smoke-test.mjs : a quick health and security check of a DEPLOYED API
// ============================================================================
// After every deploy, run this against the live URL. It takes seconds and
// answers: "is it up, and are the safety settings really on in production?"
//
//   node scripts/smoke-test.mjs https://your-api.onrender.com https://your-frontend.com
//
//   argument 1 (required): the API's base URL
//   argument 2 (optional): your frontend's origin. Enables the CORS and CSRF
//                          checks that need to act "like the frontend".
//
// Optional: also test the real login cookie. Create a throwaway verified
// account first, then:
//   SMOKE_EMAIL=you@example.com SMOKE_PASSWORD=... node scripts/smoke-test.mjs ...
// (The password stays in YOUR terminal. It is never written in any file.)
//
// It makes no changes except one login + logout when SMOKE_EMAIL is set.
// Needs Node 18 or newer. No packages to install.
// ============================================================================
import http from "node:http";
import https from "node:https";

const base = (process.argv[2] ?? "").replace(/\/$/, "");
const frontend = process.argv[3]?.replace(/\/$/, "");

if (!base) {
  console.error("Usage: node scripts/smoke-test.mjs <api-url> [frontend-origin]");
  process.exit(1);
}

// A free hosting plan may need up to a minute to wake the app up, so we wait.
const TIMEOUT_MS = 120_000;

const request = (method, path, { headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const url = new URL(base + path);
    const lib = url.protocol === "https:" ? https : http;

    const req = lib.request(
      url,
      {
        method,
        headers: {
          ...headers,
          ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body: data })
        );
      }
    );

    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);

    if (body) req.write(body);
    req.end();
  });

const json = (value) => JSON.stringify(value);
const jsonHeaders = (extra = {}) => ({ "Content-Type": "application/json", ...extra });

let failures = 0;

const check = (name, passed, detail = "") => {
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!passed) failures++;
};

const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

console.log(`Smoke test: ${base}\n`);

// --------------------------------------------------------------------------
// 1. Is it alive?
// --------------------------------------------------------------------------
check("served over HTTPS", base.startsWith("https://"));

const health = await request("GET", "/api/health");
check("GET /api/health is 200", health.status === 200, `status ${health.status}`);

const ready = await request("GET", "/api/health/ready");
check(
  "GET /api/health/ready: the database is up",
  ready.status === 200 && parse(ready.body)?.database === "up",
  `status ${ready.status}`
);

// --------------------------------------------------------------------------
// 2. Security headers (set by helmet)
// --------------------------------------------------------------------------
const h = health.headers;
check("Strict-Transport-Security is set", Boolean(h["strict-transport-security"]));
check("Content-Security-Policy is set", Boolean(h["content-security-policy"]));
check("X-Content-Type-Options is nosniff", h["x-content-type-options"] === "nosniff");
check("X-Powered-By is hidden", h["x-powered-by"] === undefined);
check("every response has an X-Request-Id", Boolean(h["x-request-id"]));

// --------------------------------------------------------------------------
// 3. Things that must NOT be reachable in production
// --------------------------------------------------------------------------
const docs = await request("GET", "/api/docs/openapi.json");
check("API docs are hidden (404)", docs.status === 404, `status ${docs.status}`);

const users = await request("GET", "/api/users");
check("GET /api/users without a token is 401", users.status === 401, `status ${users.status}`);

const tasks = await request("GET", "/api/tasks");
check("GET /api/tasks without a token is 401", tasks.status === 401, `status ${tasks.status}`);

// --------------------------------------------------------------------------
// 4. Errors fail safely
// --------------------------------------------------------------------------
const missing = await request("GET", "/api/this-route-does-not-exist");
check("unknown route is 404", missing.status === 404, `status ${missing.status}`);
check(
  "404 body does not contain a stack trace",
  !/node_modules|\.ts:\d+|at\s.+\(.+:\d+:\d+\)/.test(missing.body)
);

// --------------------------------------------------------------------------
// 5. CSRF: the Origin check
// --------------------------------------------------------------------------
const evilLogin = await request("POST", "/api/auth/login", {
  headers: jsonHeaders({ Origin: "https://evil.example" }),
  body: json({ email: "nobody@example.com", password: "x" }),
});
check(
  "POST /api/auth/login from another origin is 403",
  evilLogin.status === 403,
  `status ${evilLogin.status}`
);

const noOriginLogin = await request("POST", "/api/auth/login", {
  headers: jsonHeaders(),
  body: json({ email: "nobody@example.com", password: "x" }),
});
check(
  "POST /api/auth/login with no Origin is 403",
  noOriginLogin.status === 403,
  `status ${noOriginLogin.status}`
);

// --------------------------------------------------------------------------
// 6. CORS
// --------------------------------------------------------------------------
const evilPreflight = await request("OPTIONS", "/api/auth/login", {
  headers: {
    Origin: "https://evil.example",
    "Access-Control-Request-Method": "POST",
  },
});
check(
  "CORS does NOT allow another origin",
  evilPreflight.headers["access-control-allow-origin"] !== "https://evil.example"
);

if (frontend) {
  const okPreflight = await request("OPTIONS", "/api/auth/login", {
    headers: {
      Origin: frontend,
      "Access-Control-Request-Method": "POST",
    },
  });
  check(
    "CORS allows your frontend",
    okPreflight.headers["access-control-allow-origin"] === frontend,
    `got ${okPreflight.headers["access-control-allow-origin"]}`
  );
  check(
    "CORS allows credentials (cookies)",
    okPreflight.headers["access-control-allow-credentials"] === "true"
  );

  // Checks that need the frontend's origin to pass the CSRF check.
  const badJson = await request("POST", "/api/auth/login", {
    headers: jsonHeaders({ Origin: frontend }),
    body: "{ not json",
  });
  check("broken JSON is 400, not 500", badJson.status === 400, `status ${badJson.status}`);

  const wrongLogin = await request("POST", "/api/auth/login", {
    headers: jsonHeaders({ Origin: frontend }),
    body: json({ email: "nobody@example.com", password: "wrong-password" }),
  });
  check(
    "a wrong login is 401 and sets no cookie",
    wrongLogin.status === 401 && !wrongLogin.headers["set-cookie"],
    `status ${wrongLogin.status}`
  );
}

// --------------------------------------------------------------------------
// 7. The real login cookie (only if you provide a throwaway account)
// --------------------------------------------------------------------------
const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;

if (frontend && email && password) {
  const login = await request("POST", "/api/auth/login", {
    headers: jsonHeaders({ Origin: frontend }),
    body: json({ email, password }),
  });

  check("login with the throwaway account is 200", login.status === 200, `status ${login.status}`);

  const cookie = (login.headers["set-cookie"] ?? []).find((c) =>
    c.startsWith("refreshToken=")
  );

  check("login sets the refresh cookie", Boolean(cookie));

  if (cookie) {
    check("cookie is HttpOnly", /;\s*HttpOnly/i.test(cookie));
    check("cookie is Secure", /;\s*Secure/i.test(cookie));
    check("cookie has SameSite", /;\s*SameSite=/i.test(cookie), cookie.match(/SameSite=\w+/i)?.[0]);
    check("cookie is limited to /api/auth", /;\s*Path=\/api\/auth/i.test(cookie));

    // Clean up: end the session we just created.
    const logout = await request("POST", "/api/auth/logout", {
      headers: jsonHeaders({ Origin: frontend, Cookie: cookie.split(";")[0] }),
    });
    check("logout is 200", logout.status === 200, `status ${logout.status}`);
  }
} else {
  console.log(
    "\n(skipped: cookie checks. Give a frontend origin as argument 2, and set " +
      "SMOKE_EMAIL and SMOKE_PASSWORD, to enable them.)"
  );
}

// --------------------------------------------------------------------------
console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);