
import { AppError } from "./AppError.js";
import { logger } from "../utils/logger.js";

/**
 * ============================================================================
 * handleDatabaseError: Ginagawang safe AppError ang PostgreSQL errors.
 * ============================================================================
 * Ang raw database error ay para sa developers dahil maaari itong maglaman
 * ng table names, column names, at sensitibong user data.
 * Hindi dapat makita ng client ang raw database error.
 *
 * KNOWN ERRORS:
 * Mga error na may kinalaman sa input ng user -> 4xx response.
 *
 * DATABASE UNAVAILABLE:
 * Kapag hindi ma-access ang database -> 503 response.
 *
 * UNEXPECTED ERRORS:
 * Mga hindi inaasahang error -> generic 500 response.
 * Ang detailed error ay sa logs lang makikita, hindi sa client.
 *
 * Return type na `never` dahil laging may tina-throw na error.
 * ============================================================================
 */

type PgError = {
  name?: string;
  message?: string;
  stack?: string;
  code?: string; // PostgreSQL SQLSTATE o Node.js error code.
  constraint?: string;
  table?: string;
};

// Chine-check kung object ang error bago ito gamitin bilang PgError.
// Kapag hindi, magbabalik ng empty object.
const toPgError = (error: unknown): PgError =>
  typeof error === "object" && error !== null ? (error as PgError) : {};

// Chine-check kung hindi ma-access ang database o puno na ang connections.
// May mga ganitong error na walang SQLSTATE code, kaya pati message ay
// chine-check natin.
const isUnavailable = (
  error: PgError
): boolean => {
  const code = error.code ?? "";
  const message = error.message ?? "";

  return (
    ["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "57P01", "57P03", "53300"].includes(code) ||
    code.startsWith("08") || // Class 08: connection-related errors.
    /timeout exceeded when trying to connect|Connection terminated|connection error/i.test(message)
  );
};

export const handleDatabaseError = (
  error: unknown
): never => {
  // Kapag AppError na ang error, hindi na natin ito kailangang i-convert.
  // I-throw lang ulit ito gamit ang original status at error code.
  if (error instanceof AppError) {
    throw error;
  }

  const dbError = toPgError(error);

  switch (dbError.code) {
    // unique_violation: May existing record na gumagamit ng parehong value.
    case "23505":
      // Kapag may "email" sa constraint name, email duplicate ang error.
      // Gumagana ito sa users_email_unique at sa lower(email) index.
      if (dbError.constraint?.toLowerCase().includes("email")) {
        throw new AppError("Email already exists", 409, "EMAIL_ALREADY_EXISTS");
      }

      throw new AppError("Resource already exists", 409, "CONFLICT");

    // foreign_key_violation: May reference sa record na hindi existing.
    case "23503":
      throw new AppError("Invalid user reference", 400, "INVALID_USER_REFERENCE");

    // invalid_text_representation: Halimbawa, invalid UUID ang ipinasa
    // ng client sa request.
    case "22P02":
      throw new AppError("Invalid identifier format", 400, "INVALID_INPUT");

    // string_data_right_truncation: Mas mahaba ang value kaysa sa
    // allowed length ng database column.
    case "22001":
      throw new AppError("A value is too long", 400, "INVALID_INPUT");

    // query_canceled: Naabot ng query ang statement_timeout limit.
    case "57014":
      logger.warn({ event: "db.statement_timeout" }, "Query cancelled: too slow");
      throw new AppError("The request took too long. Please try again.", 503, "DATABASE_TIMEOUT");

    // serialization_failure at deadlock_detected:
    // Nagkaroon ng conflict sa transactions. Puwedeng subukan ulit ang request.
    case "40001":
    case "40P01":
      throw new AppError("Please try again.", 503, "DATABASE_BUSY");
  }

  // Kapag connection-related error, i-log ito at magbalik ng 503 response.
  if (isUnavailable(dbError)) {
    logger.error(
      { event: "db.unavailable", pgCode: dbError.code, message: dbError.message },
      "Database unavailable"
    );
    throw new AppError("Service temporarily unavailable", 503,"DATABASE_UNAVAILABLE");
  }

  // Unexpected error: Posibleng may typo sa SQL, missing column,
  // o ibang problema sa application.
  // I-log ang details para sa debugging pero generic error lang ang
  // ipapakita sa client.
  // Hindi natin isinasama ang `detail` dahil maaari itong maglaman
  // ng sensitibong user data tulad ng email.
  logger.error(
    {
      event: "db.unexpected_error",
      pgCode: dbError.code,
      constraint: dbError.constraint,
      table: dbError.table,
      err: {
        type: dbError.name,
        message: dbError.message,
        stack: dbError.stack,
      },
    },
    "Unexpected database error"
  );

  throw new AppError("Database error", 500, "DATABASE_ERROR");
};
