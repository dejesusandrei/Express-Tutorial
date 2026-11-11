
import { query } from "../../src/utils/databaseQueryHelper.js";

/**
 * ============================================================================
 * RESET TEST DATABASE
 * ============================================================================
 * Ginagamit ito para linisin ang database bago magsimula ang tests.
 *
 * Bakit kailangan?
 * Para bawat test ay magsimula sa malinis na database at hindi maapektuhan
 * ng data na naiwan ng previous tests.
 *
 * Safety check:
 * Bago mag-delete ng data, iche-check muna natin kung ang database na
 * connected talaga ay may pangalang naglalaman ng "test".
 *
 * IMPORTANT: Destructive operation ito. Buburahin nito ang data sa tables
 * na directly o indirectly connected sa users kapag ginamit ang CASCADE.
 * ============================================================================
 */

export const resetDatabase = async (): Promise<void> => {
  // Kunin ang actual database name mula mismo sa PostgreSQL.
  const { rows } = await query<{ name: string }>(
    "SELECT current_database() AS name"
  );

  // Kunin ang database name. Empty string ang fallback kung walang result.
  const name = rows[0]?.name ?? "";

  // Safety check: huwag magpatuloy kung hindi test database ang connection.
  if (!name.toLowerCase().includes("test")) {
    throw new Error(
      `Refusing to wipe database "${name}": its name must contain "test". ` +
        "Check .env.test (see test/setup/env.ts)."
    );
  }

  // Linisin ang users table at ang mga tables na may foreign key references
  // dito. RESTART IDENTITY resets associated auto-increment sequences.
  await query("TRUNCATE TABLE users RESTART IDENTITY CASCADE");
};

/*
  TRUNCATE TABLE users	Tanggalin ang lahat ng records sa users.
  RESTART IDENTITY	I-reset ang associated auto-increment sequences.
  CASCADE	Isama sa pag-truncate ang mga tables na may foreign key references sa users, pati dependent tables na maaapektuhan transitively.
*/
