import pg from "pg";

import { env } from "./env.js";

const { Pool } = pg;

// Why Pool?
//              ┌─ connection
//Express → Pool├─ connection
//              ├─ connection
//              └─ connection
// The application can reuse connections.

export const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  user: env.db.user,
  password: env.db.password
});

export const testDatabaseConnection = async () => {
  const client = await pool.connect();

  try {
    await client.query("SELECT 1");

    console.log("Database connected successfully");
  } finally {
    client.release();
  }
};