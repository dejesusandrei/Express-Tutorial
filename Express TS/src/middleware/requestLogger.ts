import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { logger } from "../utils/logger.js";
import {
  runWithRequestContext,
  type RequestContext,
} from "../utils/requestContext.js";

/**
 * REQUEST LOGGER
 *
 * Gumagawa ng unique requestId para sa bawat incoming request.
 * Pagkatapos ma-process ang request, nilo-log nito ang:
 * - HTTP method
 * - Request path
 * - Status code
 * - Processing time
 * - Request ID
 * - IP address
 * - User ID (kung naka-login)
 *
 * Dapat itong mauna sa middleware sa app.ts para pati rejected requests
 * ay magkaroon ng requestId at log.
 *
 * Hindi natin nilo-log ang request body, headers, at query string
 * dahil maaaring may sensitive information ang mga ito.
 */

const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Gumagawa ng unique ID para sa current request.
  const requestId = randomUUID();

  // Kinukuha kung gaano katagal ang request.
  const startedAt = process.hrtime.bigint();

  // Sine-save ang requestId para magamit ng errorHandler.
  res.locals.requestId = requestId;

  // Ipinapadala rin ang requestId sa response header.
  res.setHeader("X-Request-Id", requestId);

  // Information na ise-save sa current request context.
  const context: RequestContext = { requestId, ip: req.ip };

  // Lahat ng code na tatakbo pagkatapos nito ay puwedeng gumamit
  // ng context, kasama ang controller, service, at repository.
  runWithRequestContext(context, () => {
    // Tatakbo ito kapag tapos nang ipadala ng server ang response.
    res.on("finish", () => {

      // Kinukuha ang total processing time in milliseconds.
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

      // Pinipili ang log level base sa HTTP status code.
      // 5xx = server error
      // 4xx = client error
      // 2xx/3xx = normal request
      const level =
        res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

      // Isinusulat ang request details sa logs.
      logger[level](
        {
          event: "http.request",
          requestId: context.requestId,
          ip: context.ip,
          userId: context.userId, // May value lang ito kapag authenticated ang user.
          method: req.method,
          path: req.originalUrl.split("?")[0], // Tinatanggal ang query string.
          status: res.statusCode,
          durationMs: Math.round(durationMs), // Niroround para whole number.
        },
        "request completed"
      );
    });

    // Pinapasa ang request sa susunod na middleware.
    next();
  });
};

export default requestLogger;
