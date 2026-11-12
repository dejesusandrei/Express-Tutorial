
import pino, { type DestinationStream, type LoggerOptions } from "pino";

import { getRequestContext } from "./requestContext.js";

/**
 * ============================================================================
 * LOGGER: parang diary ng application
 * ============================================================================
 * Ang logger ay ginagamit para i-record kung ano ang nangyayari sa application.
 *
 * Instead na ordinaryong console.log() lang, gumagamit tayo ng Pino para
 * gumawa ng structured logs (JSON format).
 *
 * Example ng log:
 *
 *   {"level":40,"time":"2026-11-11T10:00:00Z","requestId":"3f1c...",
 *    "event":"auth.login_failed","reason":"bad_password","userId":"u1",
 *    "msg":"Login failed"}
 *
 * Bakit mas maganda ang structured logs?
 * - Madaling maghanap at mag-filter ng logs.
 * - May requestId para malaman kung aling request ang may error.
 * - Puwedeng itago automatically ang sensitive information tulad ng password.
 * - Mas madaling makita kung ano ang nangyari sa application.
 *
 * LOG LEVELS (mula sa least serious hanggang pinaka-serious):
 *
 * debug : Detailed information para sa developers habang nagde-develop.
 * info  : Normal na events, tulad ng successful login.
 * warn  : May suspicious activity o expected failure, tulad ng wrong password.
 * error : May serious problem na kailangan i-investigate.
 *
 * ============================================================================
 */

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

// Tinitingnan kung production environment ba o testing environment ang app.

// Puwedeng baguhin ang logging level gamit ang LOG_LEVEL sa .env.
//
// Priority:
// 1. Kung may LOG_LEVEL sa .env, iyon ang gagamitin.
// 2. Kung testing, "silent" para walang unnecessary logs.
// 3. Kung production, "info" para normal at important logs lang.
// 4. Kung development, "debug" para mas maraming details habang nagde-develop.
const DEFAULT_LEVEL =
  process.env.LOG_LEVEL ?? (isTest ? "silent" : isProduction ? "info" : "debug");

// Mga pangalan ng fields na kailangang itago sa logs.
//
// Halimbawa, kapag may na-log na password o token, papalitan ito ng
// "[REDACTED]" bago isulat sa log.
//
// Ang "*." ay ibig sabihin kahit nasa loob ng isang object ang field,
// hahanapin at itatago pa rin ito.
export const REDACT_PATHS = [
  "password",
  "newPassword",
  "password_hash",
  "token",
  "accessToken",
  "refreshToken",
  "*.password",
  "*.newPassword",
  "*.password_hash",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
];

// Function na gumagawa ng Pino logger.
//
// May dalawang optional settings:
// - level: kung anong level ng logs ang gusto nating makita.
// - destination: kung saan ipapadala o isusulat ang logs.
export const createLogger = (
  options: { level?: string; destination?: DestinationStream } = {}
) => {
  // Ito ang configuration ng Pino logger.
  const config: LoggerOptions = {
    // Ginagamit ang custom level kung meron, otherwise DEFAULT_LEVEL.
    level: options.level ?? DEFAULT_LEVEL,

    // Automatic na itinatago ang sensitive information.
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },

    // Ginagawang readable date/time format ang timestamp ng bawat log.
    timestamp: pino.stdTimeFunctions.isoTime,

    // Automatic na sinasama ang request information sa bawat log
    // habang may active request.
    //
    // Halimbawa: requestId, IP address, at userId kung available.
    mixin: () => getRequestContext(),
  };

  // Kapag development environment at walang custom destination,
  // gagamit tayo ng pino-pretty para mas madaling basahin ang logs.
  //
  // colorize: true = may colors ang logs.
  // translateTime = mas madaling basahin ang time format.
  //
  // Hindi ito ginagamit sa production at testing.
  if (!options.destination && !isProduction && !isTest) {
    config.transport = {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
    };
  }

  // Kung may custom destination, doon ipapadala ang logs.
  // Kung wala, default output ng Pino ang gagamitin.
  return options.destination ? pino(config, options.destination) : pino(config);
};

// Gumagawa ng isang shared logger na puwedeng gamitin
// sa iba't ibang parts ng application.
export const logger = createLogger();

/**
 * ============================================================================
 * MGA BAGAY NA HINDI DAPAT I-LOG
 * ============================================================================
 *
 * Kahit may automatic redaction tayo, mas magandang huwag na talagang
 * isama ang sensitive information sa logs.
 *
 * Huwag i-log ang:
 * - Password at password hash.
 * - Access token at refresh token.
 * - Password reset at email verification tokens o links.
 * - Buong Authorization at Cookie headers.
 * - Buong request body dahil baka may password o token doon.
 * - Email at iba pang personal information kung hindi naman kailangan.
 *
 * Mas magandang userId lang ang gamitin para malaman kung sinong user
 * ang involved, without exposing unnecessary personal information.
 *
 * IMPORTANT:
 * Ang logs ay puwedeng ma-save sa files, dashboards, at backups.
 * Kaya dapat ingatan natin kung anong information ang nilalagay dito.
 *
 * ============================================================================
 */
