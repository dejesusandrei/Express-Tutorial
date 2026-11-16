
import type { QueryResult, QueryResultRow } from "pg";

import { pool } from "../config/database.js";
import { handleDatabaseError } from "../errors/databaseError.js";
import { logger } from "./logger.js";

/**
 * ============================================================================
 * query(): Dito dumadaan ang lahat ng SQL queries ng application.
 * ============================================================================
 * Gumamit ng placeholders ($1, $2...) para sa user-provided values.
 * Huwag direktang idikit ang user input sa SQL query dahil puwede itong
 * magdulot ng SQL injection.
 *
 * SAFE:
 * query("SELECT * FROM users WHERE id = $1", [id])
 *
 * UNSAFE:
 * query(`SELECT * FROM users WHERE id = '${id}'`)
 * ============================================================================
 */

// Kapag umabot ng 200ms o higit pa ang query, ituturing natin itong slow query.
// Makakatulong ito para makita kung may query na kailangang i-optimize.
const SLOW_QUERY_MS = 200;

export const query = async <T extends QueryResultRow>(
  text: string,
  values?: unknown[]
): Promise<QueryResult<T>> => {
  // Itinatala ang oras bago simulan ang query para masukat ang execution time.
  const startedAt = performance.now();

  try {
    // Pinapatakbo ang SQL query gamit ang connection pool.
    return await pool.query<T>(text, values);
  } catch (error) {
    return handleDatabaseError(error);
  } finally {
    // Kinukuha ang tagal ng query at niroround ito sa whole milliseconds.
    const durationMs = Math.round(performance.now() - startedAt);

    // Maglalabas lang ng warning kapag umabot sa 200ms o higit pa ang query.
    if (durationMs >= SLOW_QUERY_MS) {
      logger.warn(
        {
          event: "db.slow_query",
          durationMs,
          // SQL query lang ang nilo-log, hindi kasama ang actual values.
          // Halimbawa, makikita ang $1 pero hindi ang email, password,
          // o token na ipinasa sa query.
          sql: text.replace(/\s+/g, " ").trim().slice(0, 200),
        },
        "Slow database query"
      );
    }
  }
};
