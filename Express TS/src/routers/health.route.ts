import { Router } from "express";

import { query } from "../utils/databaseQueryHelper.js";
import { logger } from "../utils/logger.js";

/**
 * ============================================================================
 * HEALTH CHECKS: "is the app alive?" and "is it ready to work?"
 * ============================================================================
 * Hosting platforms (Render, Railway, Kubernetes...) and uptime monitors call
 * these every few seconds.
 *
 *   GET /api/health        LIVENESS : is the process running?
 *                          If this fails, the platform RESTARTS the app.
 *
 *   GET /api/health/ready  READINESS: can it actually do its job (database up)?
 *                          If this fails, traffic is paused, but the app is
 *                          NOT restarted.
 *
 * Keep them separate: a database outage should not make the platform restart
 * a healthy app over and over.
 *
 * These routes are public, so they reveal almost nothing: no versions, no
 * error text, no connection details.
 * ============================================================================
 */
const router = Router();

router.get("/", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

router.get("/ready", async (_req, res) => {
  try {
    await query("SELECT 1");
    res.status(200).json({ status: "ok", database: "up" });
  } catch (err) {
    // The details go to the log. The public only learns "down".
    logger.error({ err, event: "health.database_down" }, "Readiness check failed");
    res.status(503).json({ status: "unavailable", database: "down" });
  }
});

export default router;