import dotenv from "dotenv";

/**
 * ============================================================================
 * test/setup/env.ts : runs before every test file
 * ============================================================================
 * Goal: when tests run, the app must connect to the TEST database, never your
 * development database.
 *
 * How: we load .env.test FIRST. dotenv never overwrites a variable that
 * already exists, so when src/config/env.ts later loads your normal .env,
 * the values from .env.test win.
 * ============================================================================
 */
dotenv.config({ path: ".env.test" });

// Rate limits are switched OFF for tests (otherwise the 6th test that logs in
// would get a 429). The rate limit test switches them back ON by itself.
// This switch only works when NODE_ENV is "test" (see middleware/rateLimit.ts).
process.env.DISABLE_RATE_LIMIT = "true";