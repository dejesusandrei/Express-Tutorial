
import app from "./app.js";
import { env } from "./config/env.config.js";
import { pool, testDatabaseConnection } from "./config/database.js";
import { logger } from "./utils/logger.js";

/**
 * ============================================================================
 * server.ts: Dito natin sinisimulan at isinasara ang Express server.
 * ============================================================================
 * Nasa app.ts ang routes, middleware, at error handlers.
 * Para kapag nag-test tayo, puwede nating i-import ang app.ts
 * nang hindi kailangang mag-start ng actual server.
 * ============================================================================
 */

const start = async (): Promise<void> => {
  // I-check muna kung connected ang database bago mag-start ang server.
  // Kapag hindi reachable ang database, hindi na itutuloy ang startup.
  await testDatabaseConnection();

  const server = app.listen(env.port, () => {
    logger.info({ port: env.port, env: env.nodeEnv }, "Server running");
  });

  // GRACEFUL SHUTDOWN
  // Kapag kailangan nang i-stop ang server, hindi natin ito basta papatayin.
  // Hihintayin muna matapos ang ongoing requests bago isara ang connections.
  const shutdown = (
    signal: string
  ): void => {
    // I-log kung anong signal ang nag-trigger ng shutdown.
    logger.info({ signal }, "Shutting down");

    // Tigilan ang pagtanggap ng bagong requests.
    // Hihintayin munang matapos ang mga requests na kasalukuyang pinoproseso.
    server.close(async () => {
      // Isara ang lahat ng database connections sa pool.
      await pool.end();

      // Exit code 0 means successful ang shutdown.
      process.exit(0);
    });

    // Kapag hindi natapos ang shutdown within 10 seconds,
    // force exit para hindi mag-hang ang application.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  // SIGTERM: Karaniwang ipinapadala ng hosting platform kapag mag-stop na ang app.
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // SIGINT: Karaniwang nangyayari kapag pinindot natin ang Ctrl + C.
  process.on("SIGINT", () => shutdown("SIGINT"));
};

// Kapag may Promise na nag-fail at walang catch() na humawak,
// i-log ang error at i-stop ang application.
process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled promise rejection");
  process.exit(1);
});

// Kapag may error na hindi na-handle ng application,
// i-log ito at i-stop ang process.
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  process.exit(1);
});

// Simulan ang server.
// Kapag nag-fail ang startup, i-log ang error at i-stop ang application.
start().catch((error) => {
  logger.fatal({ err: error }, "Failed to start the server");
  process.exit(1);
});
