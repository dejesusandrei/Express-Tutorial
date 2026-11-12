import type { Request, Response, NextFunction } from "express";

import { verifyAccessToken } from "../utils/jwt.js";
import { setRequestUserId } from "../utils/requestContext.js";
import * as refreshTokenRepository from "../repositories/refreshToken.repository.js";
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
 *   3. Check the token itself (signature, expiry, issuer, audience)
 *   4. Check that the SESSION behind the token is still alive   <-- new
 *   5. Save who the user is in req.user, then call next()
 *
 * Step 4 is why logout works instantly. A JWT alone can't be "taken back", so
 * every token carries the id of its login session. Logout revokes that
 * session, and from then on the token is refused, even if it hasn't expired.
 * (Like a concert wristband that the guard also checks against the guest list.)
 * ============================================================================
 */

// This function is async (it talks to the database), so a plain "throw" would
// NOT be caught by Express 4. We wrap everything in try/catch and pass the
// error to next() ourselves. This works in Express 4 and 5.
export const authMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    // STEP 1: Is there an Authorization header?
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
    }

    // STEP 2: "Bearer abc123" -> ["Bearer", "abc123"]. Exactly two parts.
    // The scheme name is case-insensitive in HTTP, so compare in lowercase.
    const parts = authHeader.split(" ");

    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer" || !parts[1]) {
      throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
    }

    // STEP 3: Check the token.
    // Throws 401 TOKEN_EXPIRED or 401 INVALID_TOKEN by itself.
    const { userId, sessionId } = verifyAccessToken(parts[1]);

    // STEP 4: Is the session behind this token still alive?
    // After logout (or reuse detection), the session is revoked, so the token
    // stops working right away instead of living on for up to 15 minutes.
    const sessionActive = await refreshTokenRepository.isSessionActive(sessionId);
    
    if (!sessionActive) {
      throw new AppError("Session has ended. Please log in again.", 401, "SESSION_ENDED");
    }

    // STEP 5: Remember who is calling.
    // setRequestUserId: para ang mga log line ng request na ito ay may userId na rin.
    setRequestUserId(userId);
    req.user = { userId };

    next();
  } catch (error) {
    next(error);
  }
};