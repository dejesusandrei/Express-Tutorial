import { AppError } from "./AppError.js";

export const handleDatabaseError = (
  error: unknown
): never => {
  if ( typeof error === "object" && error !== null && "code" in error ) {

    const dbError = error as {
      code?: string;
      constraint?: string;
    };

    if ( dbError.code === "23505" && dbError.constraint === "users_email_unique" ) {
      throw new AppError( "Email already exists", 409, "EMAIL_ALREADY_EXISTS");
    }
  }

  throw new AppError(
    "Database error",
    500,
    "DATABASE_ERROR"
  );
};