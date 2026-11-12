import type { ErrorRequestHandler } from "express";

import { AppError } from "../errors/AppError.js";
import { logger } from "../utils/logger.js";

// Kinukuha ang error type na galing sa express.json().
const bodyParserErrorType = (error: unknown): string | undefined => {
  // Chine-check kung object ang error at kung may property na "type".
  if (typeof error === "object" && error !== null && "type" in error) {
    return String((error as { type: unknown }).type);
  }
  return undefined;
};

// Central handler para sa lahat ng errors ng application.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Kinukuha ang request ID para madaling mahanap ang related log.
  const requestId = res.locals.requestId as string | undefined;

  // 1. Errors na intentionally ginawa natin gamit ang AppError.
  if (err instanceof AppError) {
    // 5xx errors use error level; other errors use warn.
    const level = err.statusCode >= 500 ? "error" : "warn";

    // Nilalagay sa log ang error code, status, at message.
    logger[level](
      { event: "http.error", code: err.code, status: err.statusCode },
      err.message
    );

    // Ipinapadala sa client ang safe error response.
    res.status(err.statusCode).json({
      success: false,
      error: {
        status: err.statusCode,
        message: err.message,
        code: err.code,
        // Isinasama lang ang details kung meron.
        ...(err.details && { details: err.details }),
      },
    });
    return;
  }

  // 2. Errors na galing sa express.json(), tulad ng invalid JSON.
  const bodyErrorType = bodyParserErrorType(err);

  // Kapag hindi valid ang JSON request body, mag-return ng 400.
  if (bodyErrorType === "entity.parse.failed") {
    logger.warn({ event: "http.bad_json" }, "Request body is not valid JSON");

    res.status(400).json({
      success: false,
      error: {
        status: 400,
        message: "Request body is not valid JSON",
        code: "INVALID_JSON",
      },
    });
    return;
  }

  // Kapag masyadong malaki ang request body, mag-return ng 413.
  if (bodyErrorType === "entity.too.large") {
    logger.warn({ event: "http.payload_too_large" }, "Request body too large");

    res.status(413).json({
      success: false,
      error: {
        status: 413,
        message: "Request body is too large",
        code: "PAYLOAD_TOO_LARGE",
      },
    });
    return;
  }

  // 3. Other errors na hindi natin na-handle sa taas.
  // Puwedeng bug or database problem, kaya nilalagay ang full error sa log.
  logger.error({ err, event: "http.unhandled_error" }, "Unhandled error");

  // Generic response lang ang ibinibigay sa client.
  // Hindi ipinapakita ang stack trace o internal error details.
  res.status(500).json({
    success: false,
    error: {
      status: 500,
      message: "Internal server error",
      code: "INTERNAL_SERVER_ERROR",
      requestId,
    },
  });
};
