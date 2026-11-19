import { Router } from "express";
import swaggerUi from "swagger-ui-express";

import { openApiSpec } from "../docs/openapi.js";

/**
 * ============================================================================
 * /api/docs : the interactive documentation page (Swagger UI)
 * ============================================================================
 *   GET /api/docs/openapi.json   the raw document (tools can import it)
 *   GET /api/docs/               the web page where you read and try endpoints
 *
 * This router is mounted in app.ts ONLY when env.docsEnabled is true, and that
 * is OFF by default in production. A public map of every endpoint, with its
 * error codes, is a gift to attackers. Keep it for development and for a
 * private staging server.
 * ============================================================================
 */
const router = Router();

// The raw document. Registered BEFORE the Swagger UI handler below.
router.get("/openapi.json", (_req, res) => {
  res.json(openApiSpec);
});

router.use(
  "/",
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customSiteTitle: "Express TS API docs",
    swaggerOptions: {
      // Do NOT keep the pasted access token in the browser's localStorage.
      // It is a secret; it should disappear when the page is closed.
      persistAuthorization: false,
    },
  })
);

export default router;