
import pg from "pg";

import { env } from "./env.config.js";
import { logger } from "../utils/logger.js";

const { Pool } = pg;

/**
 * ============================================================================
 * THE CONNECTION POOL: Parang taxi stand
 * ============================================================================
 * Ang connection pool ay may limitadong bilang ng database connections
 * na puwedeng gamitin ng maraming requests ng application.
 *
 * Sa halip na gumawa ng bagong connection sa bawat request, nire-reuse
 * ng application ang mga available connections mula sa pool.
 *
 * Kapag walang limit ang connections, maaaring magkaroon ng dalawang problema:
 * - Puwedeng maghintay nang matagal ang requests kapag busy lahat ng connections.
 * - Puwedeng maipit ang ibang requests kapag may query na sobrang tagal.
 *
 * Kaya nagse-set tayo ng limits at timeouts para maiwasan ang mga ito.
 * ============================================================================
 */
export const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  user: env.db.user,
  password: env.db.password,

  // Maximum na 10 database connections ang puwedeng gamitin ng app instance.
  // Siguraduhing hindi lalampas ang total connections ng lahat ng app instances
  // sa PostgreSQL max_connections para may matirang connections para sa admin
  // tools at database migrations.
  max: 10,

  // Isasara ang connection kapag hindi nagamit sa loob ng 30 seconds.
  idleTimeoutMillis: 30_000,

  // Kapag busy lahat ng connections, maghihintay lang ng hanggang 5 seconds.
  // Kapag walang available connection pagkatapos nito, magfa-fail ang request.
  connectionTimeoutMillis: 5_000,

  // Ika-cancel ng PostgreSQL ang query kapag umabot ito sa 10 seconds.
  // Hindi nito naaapektuhan ang migrations at seed scripts na pinapatakbo
  // gamit ang psql.
  statement_timeout: 10_000,

  // Ika-cancel ang transaction kapag nagsimula na ito pero walang query
  // na tumatakbo sa loob ng 15 seconds.
  // Nakakatulong ito para maiwasan ang transactions na naiwan nang bukas.
  idle_in_transaction_session_timeout: 15_000,

  // Pangalan ng application na makikita sa PostgreSQL pg_stat_activity.
  // Makakatulong ito para malaman kung aling application ang gumagamit
  // ng database connection.
  application_name: "express-api",

  // Kapag deployed na ang app, maaaring kailanganin ang SSL connection
  // depende sa requirements ng database provider.
  // Halimbawa:
  // ssl: env.db.ssl ? { rejectUnauthorized: true } : false,
});

// Hinahandle ang unexpected errors sa idle database connections.
// Halimbawa, kapag nag-restart ang database habang walang gumagamit
// ng isang connection, dito natin nilo-log ang error.
pool.on("error", (err) => {
  logger.error(
    { err: { type: err.name, message: err.message }, event: "db.pool_error" },
    "Unexpected error on an idle database connection"
  );
});

// Tinatawag ito isang beses sa startup (sa server.ts).
// Chine-check kung reachable ang database bago tuluyang simulan ang app.
export const testDatabaseConnection = async (): Promise<void> => {
  // Kumuha ng available connection mula sa pool.
  const client = await pool.connect();

  try {
    // Simpleng query para malaman kung gumagana ang database connection.
    await client.query("SELECT 1");

    // Mag-log ng success kapag nakasagot ang database.
    logger.info({ event: "db.connected" }, "Database connected successfully");
  } finally {
    // Ibalik ang connection sa pool pagkatapos gamitin.
    // Tumatakbo ito kahit successful o nagkaroon ng error ang query.
    client.release();
  }
};
