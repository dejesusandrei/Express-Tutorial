import type {
  QueryResult,
  QueryResultRow
} from "pg";

import { pool } from "../config/database.js";
import { handleDatabaseError } from "../errors/databaseError.js";

export const query = async <T extends QueryResultRow>(
  text: string,
  values?: unknown[]
): Promise<QueryResult<T>> => {
  try {
    return await pool.query<T>(text, values);
  } catch (error) {
    return handleDatabaseError(error);
  }
};