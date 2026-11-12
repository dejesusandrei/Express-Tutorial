import "dotenv/config";

import { parseEnv } from "./parseEnv.js";

/**
 * ============================================================================
 * src/config/env.ts : the ONLY place that reads process.env
 * ============================================================================
 * Everything else imports `env` from here. Nobody writes process.env.X in the
 * middle of the code, so there is one list of settings and one place that
 * checks them.
 *
 * "dotenv/config" loads your .env file, but never overwrites variables that
 * already exist. That is why, in tests, the values from .env.test (loaded
 * first by test/setup) win over .env. And in production, the variables set on
 * the hosting dashboard win too (there you usually have no .env file at all).
 *
 * If a setting is missing or invalid, parseEnv throws and the server does not
 * start. That is on purpose ("fail fast").
 * ============================================================================
 */
export const env = parseEnv(process.env);