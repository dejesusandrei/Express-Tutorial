import app from "./app.js";
import { env } from "./config/env.config.js";

/**
 * ============================================================================
 * server.ts: ONLY starts the server
 * ============================================================================
 * The app itself (middleware, routes, error handlers) lives in app.ts.
 *
 * Why split them? app.listen() opens a real network port. If the app and the
 * listen call were in the same file, importing the app in a test would start
 * a server every time. Now tests import app.ts (no port), and only this file,
 * the one you run with "npm run dev", opens the port.
 * ============================================================================
 * 
 * app.ts
  Application setup
  - Creates Express application.
  - Registers middleware.
  - Registers routes.
  - Registers error handlers.
  - Exports app.
  - Does not open a port.
  ============================================================================
 * server.ts
  server.ts
  Server startup
  - Imports app.
  - Reads env.port.
  - Calls app.listen().
  - Starts the actual HTTP server.
 * 
 * 
 */


app.listen(env.port, () => {
  console.log(`Server running on port ${env.port}`);
});