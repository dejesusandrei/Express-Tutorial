# Deployment runbook (Render example)

Keep this file in the repo (`docs/DEPLOYMENT.md`). Hosting dashboards change;
the ideas stay the same on Railway, Fly.io, and others.

> Prices, free-plan limits, and button names change often. Check Render's
> pricing page and docs before you rely on any number. At the time of writing,
> articles say free web services go to sleep after about 15 minutes without
> traffic (the first request afterwards is slow), and the free PostgreSQL
> database expires after a set period (articles say 90 days; confirm on the
> official page) and its data is deleted. Don't keep anything you can't lose
> on a free database.

---

## 1. Prepare the repository

**`package.json`** needs these scripts and a Node version:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run"
  },
  "engines": { "node": ">=20" }
}
```

(Keep your own `dev` script. Add `build`, `start`, and `engines`.)

**`tsconfig.json`** must write the compiled files to `dist` and include only `src`:

```json
{
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

(Merge these into your existing file. Don't delete the other options.)

**`.gitignore`** must contain:

```
node_modules
dist
.env
.env.*
!.env.example
```

**Test the production build on your computer BEFORE deploying:**

```
npm run build
node dist/server.js
```

If this fails, hosting will fail the same way. Fix it here, where it is cheap.

**Save a snapshot of the database structure** (tables and indexes, no data), so
CI and a fresh database can be created from it:

```
mkdir db
pg_dump -U postgres -s -O -x -d YOUR_DEV_DB -f db/schema.sql
```

Commit `db/schema.sql`. Re-create it whenever you add a migration.

---

## 2. Create the database

1. Create a PostgreSQL database on the host, in the SAME region you will use for
   the web service.
2. The host shows two addresses: an **internal** one (only reachable from the
   host's own network) and an **external** one (reachable from your computer).
   The web service should use the **internal** address (faster, and not exposed).
3. Load the tables from your computer, using the **external** connection string
   (it contains the password: never paste it into a chat, a file, or Git):

```
psql "EXTERNAL_CONNECTION_STRING" -f db/schema.sql
```

---

## 3. Create the web service

| Setting | Value |
|---|---|
| Repository | your GitHub repo, branch `main` |
| Runtime | Node |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |
| Auto-deploy | on, **only after CI checks pass** |

Why `--include=dev`: if `NODE_ENV=production` is set while building, npm skips
devDependencies, and `tsc` (TypeScript) lives there. Without it the build fails
with "tsc: not found".

Why `/api/health` and not `/api/health/ready`: a database hiccup should not make
the platform restart a perfectly healthy app. Point an **uptime monitor** at
`/api/health/ready` instead (see step 7).

---

## 4. Environment variables (set them in the dashboard, never in Git)

| Name | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | leave it to the host (it sets it). The app reads it |
| `FRONTEND_URL` | `https://your-frontend-domain` (exact origin, https, no trailing path) |
| `DB_HOST` | from the database's INTERNAL connection info |
| `DB_PORT` | `5432` (or what the host shows) |
| `DB_NAME` | from the host |
| `DB_USER` | from the host |
| `DB_PASSWORD` | from the host |
| `DB_SSL` | `false` on the internal address; `true` if you connect over the external one |
| `JWT_SECRET` | a NEW random value, used ONLY in production (see below) |
| `TRUST_PROXY` | `1` (the host's proxy is in front of the app) |
| `COOKIE_SAMESITE` | `lax` if frontend and API share the same site; `none` if they don't (step 5) |
| `LOG_LEVEL` | `info` |
| `API_DOCS_ENABLED` | leave it unset (docs stay OFF in production) |

Generate the production JWT secret on your computer:

```
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Never reuse the development or test secret.

`TRUST_PROXY=1` matters: without it the app sees the proxy's address for every
visitor, so the rate limiter treats everybody as one person, and the logs show
the wrong IP.

---

## 5. Frontend and API on different sites? (cookies)

| Where they live | `COOKIE_SAMESITE` | Notes |
|---|---|---|
| Same site (for example `app.example.com` and `api.example.com`) | `lax` | Best. Browsers add extra CSRF protection |
| Different sites (for example `myapp.vercel.app` and `myapi.onrender.com`) | `none` | The cookie travels cross-site. It must be Secure (https). `verifyOrigin` becomes the main CSRF defense. Test it |

Some hosting domains are on the "public suffix list", which makes two apps under
the same provider domain count as DIFFERENT sites. When in doubt, use `none` and
run the smoke test, which checks the cookie flags.

Using your own custom domain for both (`app.yourname.com` and
`api.yourname.com`) lets you keep `lax`.

---

## 6. First deploy and the smoke test

1. Deploy. Open the logs. You should see `Database connected successfully` and
   `Server running`. If the app stops with `Invalid environment configuration`,
   the message names the bad setting (never its value).
2. From your computer:

```
node scripts/smoke-test.mjs https://YOUR-API https://YOUR-FRONTEND
```

All checks must say PASS. The first call to a sleeping free service can take
up to a minute.

3. Optional cookie checks: create a throwaway, verified account, then

```
set SMOKE_EMAIL=throwaway@example.com
set SMOKE_PASSWORD=its-password
node scripts/smoke-test.mjs https://YOUR-API https://YOUR-FRONTEND
```

(On macOS or Linux use `export` instead of `set`.)

---

## 7. After the first deploy

- **CI gate**: in the host's settings, deploy only after the GitHub checks pass.
- **Uptime monitor**: a free monitor that calls `/api/health/ready` every minute
  and emails you when it returns 503.
- **Logs**: search for these events: `auth.refresh_reuse_detected` (possible
  stolen token: investigate every time), `auth.login_failed` with a sudden spike
  of `unknown_user` (credential stuffing), `db.slow_query`, `db.unavailable`,
  `http.unhandled_error`.
- **Backups**: a free database may be deleted when its plan period ends. Export
  regularly: `pg_dump -Fc "EXTERNAL_CONNECTION_STRING" -f backup.dump`, and
  store the file somewhere private. A backup you never tried to restore is not a
  backup. Practice restoring it into a test database.
- **Rollback**: if a deploy breaks things, redeploy the previous commit from the
  dashboard. A database migration cannot be rolled back that way, so write
  migrations that the OLD code can still live with (add columns, don't rename
  or delete them in the same release).
- **Dependencies**: `npm audit` runs in CI. Update packages regularly.
- **If a secret leaks** (committed to Git, pasted in a chat or a screenshot):
  replace it at once. A new `JWT_SECRET` logs everybody out, which is the
  point. Rotate the database password too.

---

## 8. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Build fails: `tsc: not found` | devDependencies were skipped. Use `npm ci --include=dev` |
| `ERR_MODULE_NOT_FOUND` at start | An import is missing `.js`, or `tsconfig` module settings don't match. Reproduce with `npm run build && node dist/server.js` |
| `Invalid environment configuration` | A setting is missing or wrong. The message names it |
| `self-signed certificate` | `DB_SSL=true` with a host that uses its own certificate. Use the internal address, or give Node the host's CA certificate |
| `no pg_hba.conf entry` / connection refused | Wrong host or port, or the database doesn't accept your address |
| Everything is `429` | `TRUST_PROXY` is `0` behind a proxy: all visitors share one counter |
| Browser blocks every request (CORS) | `FRONTEND_URL` doesn't match the frontend's exact origin |
| `403 INVALID_ORIGIN` on login | Same cause, or the frontend runs on a different origin than `FRONTEND_URL` |
| Login works but you're logged out on refresh | The cookie isn't being kept: check `COOKIE_SAMESITE`, https, and `credentials: "include"` in the frontend |
| First request takes about a minute | A free service woke up from sleep. Normal |
| `/api/docs` is 404 in production | Intended. Set `API_DOCS_ENABLED=true` only on a private staging server |