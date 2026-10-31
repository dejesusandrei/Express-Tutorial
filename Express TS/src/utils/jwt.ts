import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";

/**
 * ============================================================================
 * JWT (access token): the "wristband" at a concert
 * ============================================================================
 * After login, the server gives you a wristband (the token). You show it at
 * every door (request). The guard checks 3 things:
 *   1. Is the stamp real?        -> the signature (made with our secret)
 *   2. Is it from OUR concert?   -> issuer / audience
 *   3. Has it expired?           -> exp (we use 15 minutes)
 *
 * The token is only SIGNED, not hidden. Anyone can read what's inside
 * (try pasting one on jwt.io). So never put passwords or private data in it.
 * ============================================================================
 */

export type AccessTokenPayload = {
  userId: string;
};

// Settings in one place, so sign and verify can never disagree.
const ACCESS_TOKEN_EXPIRES_IN = "15m";

// Only allow ONE algorithm. See verifyAccessToken for why this matters.
const JWT_ALGORITHM = "HS256";

// "Which concert is this wristband for?" A token made for another app (or for
// another part of your system) will be rejected here.
const JWT_ISSUER = "express-tutorial-api"; // who created the token
const JWT_AUDIENCE = "express-tutorial-client"; // who the token is meant for

// ---------------------------------------------------------------------------
// Create a token (login and refresh call this)
// ---------------------------------------------------------------------------
export const generateAccessToken = (userId: string): string => {
  return jwt.sign({ userId }, env.jwtSecret, {
    algorithm: JWT_ALGORITHM, // be explicit; don't rely on library defaults
    expiresIn: ACCESS_TOKEN_EXPIRES_IN, // short life = small damage if stolen
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
};

// ---------------------------------------------------------------------------
// Check a token (your auth middleware calls this)
// ---------------------------------------------------------------------------
// Returns the payload if the token is good. Throws an AppError (401) if not.
export const verifyAccessToken = (token: string): AccessTokenPayload => {
  let decoded: string | jwt.JwtPayload;

  try {
    decoded = jwt.verify(token, env.jwtSecret, {
      // IMPORTANT: always list the allowed algorithms when verifying.
      // Without it, attackers try tricks like the "none" algorithm
      // (a token with NO signature) or switching algorithms. We accept
      // HS256 and nothing else.
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  } catch (error) {
    // Two different codes on purpose:
    //  - TOKEN_EXPIRED : normal! The frontend should call /refresh and retry.
    //  - INVALID_TOKEN : tampered, wrong secret, garbage. Log in again.
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError("Access token expired", 401, "TOKEN_EXPIRED");
    }
    throw new AppError("Invalid access token", 401, "INVALID_TOKEN");
  }

  // jwt.verify can return a string or an object, and we can't trust what is
  // inside, so check the shape instead of just writing "as AccessTokenPayload".
  if (
      typeof decoded !== "object" ||
      decoded === null ||
      !("userId" in decoded) ||
      typeof decoded.userId !== "string"
    ) {
      throw new AppError("Invalid token", 401, "INVALID_TOKEN");
    }

  return { userId: decoded.userId };
};

/**
 * ============================================================================
 * REMEMBER
 * ============================================================================
 * 1. SECRET: env.jwtSecret must be long and random (32+ bytes). Generate one:
 *      node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
 *    Put it in .env. Never commit .env, never hardcode the secret.
 *    If the secret leaks, anyone can make valid tokens for any user.
 *
 * 2. Tokens can't be "taken back": after logout or a password change, an
 *    existing access token still works until it expires (max 15 minutes).
 *    That is the price of short-lived tokens, and it is why we keep them short.
 *
 * 3. Only userId is in the token. Good. Role and other data are read from the
 *    database on each request, so a demoted admin loses power right away.
 *
 * 4. After adding issuer/audience, OLD tokens (made without them) are rejected.
 *    In development just log in again.
 * ============================================================================
 */