
import type { PoolClient } from "pg";

import { pool } from "../config/database.js";
import { handleDatabaseError } from "../errors/databaseError.js";
import { logger } from "./logger.js";

/**
 * ============================================================================
 * transaction(): Lahat o wala (all or nothing).
 * ============================================================================
 * Pinagsasama ang maraming SQL queries sa iisang transaction.
 * Kapag successful lahat, ise-save ang changes gamit ang COMMIT.
 * Kapag may nag-fail, ibabalik ang database sa dating state gamit ang ROLLBACK.
 *
 * Example:
 *
 * await transaction(async (client) => {
 *   await client.query("UPDATE ...", [...]);
 *   await client.query("INSERT ...", [...]);
 * });
 *
 * RULES:
 * 1. Gumamit ng client.query() sa loob ng transaction.
 *    Huwag gamitin ang query() helper dahil ibang connection ang kukunin nito
 *    mula sa pool. Hindi magiging bahagi ng current transaction ang query na iyon.
 *
 * 2. Panatilihing maikli ang transaction.
 *    Habang tumatakbo ito, may isang database connection na naka-reserve.
 *    Huwag mag-send ng email o tumawag ng ibang API sa loob nito.
 *    Gawin ang mga iyon pagkatapos ng COMMIT.
 * ============================================================================
 */
export const transaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  // Kumuha ng available connection mula sa pool.
  // Kapag walang available connection, magfa-fail ito kapag lumampas
  // sa connectionTimeoutMillis.
  let client: PoolClient;

  try {
    client = await pool.connect();
  } catch (error) {
    return handleDatabaseError(error);
  }

  // Kapag nag-fail ang ROLLBACK, hindi natin alam kung ano na ang state
  // ng connection. Kaya hindi na natin ito ibabalik sa pool.
  let discardClient = false;

  try {
    await client.query("BEGIN");

    // Pinapatakbo ang lahat ng queries na nasa callback.
    const result = await callback(client);

    // Kapag successful lahat ng queries, ise-save ang changes.
    await client.query("COMMIT");

    return result;
  } catch (error) {
    try {
      // Kapag may nag-fail, i-cancel ang lahat ng changes sa transaction.
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      // Kapag pati ROLLBACK ay nag-fail, huwag nang gamitin ulit
      // ang connection dahil maaaring nasa invalid state na ito.
      discardClient = true;

      logger.error(
        { err: rollbackError, event: "db.rollback_failed" },
        "Transaction rollback failed; discarding the connection"
      );
    }
    return handleDatabaseError(error);
  } finally {
    // Ibalik ang connection sa pool pagkatapos gamitin.
    // Kapag discardClient ay true, tuluyan itong aalisin sa pool.
    client.release(discardClient);
  }
};
