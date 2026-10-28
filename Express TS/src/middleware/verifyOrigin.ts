import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";

/**
 * CSRF protection: Origin / Referer verification
 * ----------------------------------------------
 * CSRF = a malicious site (evil.com) makes the victim's browser send a request
 * to your API, and the browser automatically attaches your cookies.
 *
 * Defense: browsers always tell the server where a request came from, using
 * the Origin header (or Referer as a fallback). JavaScript on evil.com can't
 * fake or change these headers. So we only accept state-changing requests
 * coming from our own frontend.
 *
 * This is a second layer on top of SameSite cookies, not a replacement.
 */

// These methods must never change data, so CSRF can't hurt through them.
// OPTIONS is the CORS preflight; the cors() middleware answers it first.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Reduce any URL to its origin: "scheme://host:port".
//  "http://localhost:5173/"            -> "http://localhost:5173"
//  "http://localhost:5173/some/page"   -> "http://localhost:5173"
// This avoids false mismatches from trailing slashes or full Referer URLs.
// Returns null for garbage, or for the opaque "null" origin (sandboxed iframes).
const toOrigin = (
  value: string
): string | null => {
  try {
    const origin = new URL(value).origin;
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
};

// Allowed origins. To allow more (e.g. an admin site), add them to this array.
const allowedOrigins = new Set(
  [env.frontendUrl]
    .map(toOrigin)
    .filter((origin): origin is string => origin !== null)
);

// Fail fast at startup: a bad FRONTEND_URL would silently block every request.
if (allowedOrigins.size === 0) {
  throw new Error("verifyOrigin: env.frontendUrl is not a valid URL");
}

export const verifyOrigin = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  // 1. Reads can't change state, so skip them.
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // 2. Prefer Origin. Use Referer only when Origin is absent.
  //    (If Origin is present but wrong, we do NOT fall back to Referer.)
  const source = req.get("Origin") ?? req.get("Referer");

  // 3. Browsers always send one of them on POST/PUT/PATCH/DELETE.
  // Browser requests normally include Origin or Referer.
  // If both are missing, reject this cookie-authenticated request.
  //    Neither present = not a normal browser request (curl, scripts) or a
  //    stripped request. Reject it, since this route relies on cookies.
  if (!source) {
    return next(
      new AppError("Request origin is required", 403, "ORIGIN_REQUIRED")
    );
  }

  // 4. Compare normalized origins against the allow-list.
  const origin = toOrigin(source);

  if (!origin || !allowedOrigins.has(origin)) {
    return next(
      new AppError("Invalid request origin", 403, "INVALID_ORIGIN")
    );
  }

  next();
};