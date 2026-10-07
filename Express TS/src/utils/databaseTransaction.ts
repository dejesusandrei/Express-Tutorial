import { pool } from "../config/database.js";
import type { PoolClient } from "pg";
import { handleDatabaseError } from "../errors/databaseError.js";

export const transaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await callback(client);

    await client.query("COMMIT");

    return result;
  } catch (error) {
    // what if the rollback itself fails? we should handle that case as well
    try{
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Error rolling back transaction:", rollbackError);
    }

    return handleDatabaseError(error);
  } finally {
    client.release();
  }
};