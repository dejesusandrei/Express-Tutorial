import type { Request, Response, NextFunction } from "express";

import { verifyAccessToken } from "../utils/jwt.js";
import { AppError } from "../errors/AppError.js";

/**
 * ============================================================================
 * authMiddleware: the "wristband checker" for protected routes
 * ============================================================================
 * The client sends:   Authorization: Bearer <accessToken>
 *
 * Steps:
 *   1. Read the Authorization header
 *   2. Split it into "scheme" and "token"
 *   3. Ask verifyAccessToken() if the token is real and not expired
 *   4. Save who the user is in req.user, then call next()
 *
 * All the real token checking lives in ONE place (utils/jwt.ts), so the
 * rules (algorithm, issuer, audience, expiry) can never differ between files.
 * ============================================================================
 */
export const authMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  // STEP 1: Is there an Authorization header?
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  // STEP 2: Split "Bearer abc123" into ["Bearer", "abc123"].
  // We insist on EXACTLY two parts, so "Bearer a b c" is rejected.
  const parts = authHeader.split(" ");

  if (parts.length !== 2) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  const [scheme, token] = parts;

  // The scheme name is case-insensitive in the HTTP standard
  // ("bearer" and "Bearer" are both valid), so compare in lowercase.
  if (scheme.toLowerCase() !== "bearer" || !token) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  // STEP 3: Check the token.
  // verifyAccessToken throws an AppError by itself:
  //   - 401 TOKEN_EXPIRED : expired (the frontend should call /refresh)
  //   - 401 INVALID_TOKEN : fake, tampered, wrong algorithm/issuer/audience
  // So no try/catch is needed here. Express passes the error to errorHandler.
  const { userId } = verifyAccessToken(token);

  // STEP 4: Remember who is calling.
  // Controllers must use THIS id for "my own data", never an id typed by the
  // user in req.body or req.params.
  req.user = { userId };

  next();
};