import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError.js";

/**
 * ============================================================================
 * RATE LIMITING: the "candy jar rule"
 * ============================================================================
 *
 * Imagine a candy jar with a sign: "Each kid may take 5 candies per hour."
 * The guard keeps a tally for every kid. When a kid reaches 5, the guard says
 * "Come back later" (HTTP 429 Too Many Requests).
 *
 * Our server does the same thing: it counts how many requests each visitor
 * (identified by IP address) made in a time window, and blocks them when they
 * go over the limit.
 *
 * WHAT ATTACKS THIS STOPS
 * -----------------------
 * - Brute force      : a robot tries 1,000,000 passwords on one account.
 * - Credential stuffing: a robot tries leaked email+password pairs from other
 *                        websites against your login.
 * - Spam sign-ups    : a robot creates thousands of fake accounts.
 * - Overload (basic DoS): one visitor floods the server with requests.
 *
 * Each route gets its own limit, because their risk is different:
 * login is dangerous, so it is strict; a normal page is harmless, so it is loose.
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Helper: what happens when someone goes over the limit
// ---------------------------------------------------------------------------
// Instead of sending a response ourselves, we pass an AppError to next().
// Then your errorHandler formats it the SAME way as every other error, so the
// frontend always sees the same JSON shape: { success: false, error: {...} }.
//
// The library already adds a "Retry-After" header automatically, which tells
// the client how many seconds to wait.
const tooManyRequests = (message: string) =>
  (_req: Request, _res: Response, next: NextFunction) =>
    next(new AppError(message, 429, "TOO_MANY_REQUESTS"));

// ---------------------------------------------------------------------------
// 1. GLOBAL limiter: a loose rule for the whole API
// ---------------------------------------------------------------------------
// Catches robots that flood ANY endpoint. High number so normal users never
// notice it: 300 requests per 15 minutes per IP.
export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // the time window: 15 minutes (in milliseconds)
  limit: 300, // max requests per IP inside that window
  standardHeaders: "draft-8", // send RateLimit headers so clients can see their quota
  legacyHeaders: false, // don't send the old X-RateLimit-* headers
  handler: tooManyRequests("Too many requests. Please slow down."),
});

// ---------------------------------------------------------------------------
// 2. LOGIN limiter: the strictest rule (brute force target #1)
// ---------------------------------------------------------------------------
// 5 FAILED attempts per 15 minutes per IP.
// skipSuccessfulRequests: a correct login does NOT use up the counter, so a
// real user who logs in normally never gets blocked. Only wrong passwords count.
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: tooManyRequests("Too many login attempts. Try again in 15 minutes."),
});

// ---------------------------------------------------------------------------
// 3. REGISTER limiter: stop fake-account spam
// ---------------------------------------------------------------------------
// 5 sign-ups per hour per IP. A real person rarely creates more than one.
export const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: tooManyRequests("Too many accounts created. Try again later."),
});

// ---------------------------------------------------------------------------
// 4. REFRESH limiter: a medium rule
// ---------------------------------------------------------------------------
// A real app calls /refresh only when the access token expires (every ~15 min),
// so 30 per 15 minutes is generous for humans but stops hammering.
export const refreshRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: tooManyRequests("Too many refresh requests. Try again later."),
});

/**
 * ============================================================================
 * THINGS TO REMEMBER (the "gotchas")
 * ============================================================================
 *
 * 1. WHO IS "THE VISITOR"? By default it is req.ip.
 *    Behind a proxy (Render, Railway, Nginx, Cloudflare), every request looks
 *    like it comes from the PROXY's IP, so ALL users would share one counter!
 *    Fix, in app.ts, when deployed behind exactly one proxy:
 *        app.set("trust proxy", 1);
 *    Do NOT set it to true blindly: then an attacker can fake the
 *    X-Forwarded-For header and get a fresh counter on every request.
 *
 * 2. MEMORY STORE: counters live in the server's memory by default.
 *    - Restarting the server resets everyone's counter.
 *    - With 2+ server copies, each has its own counter (attacker gets 2x).
 *    In production use a shared store such as Redis (rate-limit-redis).
 *
 * 3. IP-only limits are not perfect: attackers rotate IPs, and many real users
 *    can share one IP (a school or office). That is why we also add
 *    per-account protection in the next lesson (account lockout).
 *
 * WHERE TO USE (examples)
 * -----------------------
 *   app.ts          : app.use(globalRateLimit);       // before the routes
 *   auth.route.ts   : router.post("/register", registerRateLimit, ...);
 *                     router.post("/login",    loginRateLimit, ...);
 *                     router.post("/refresh",  refreshRateLimit, ...);
 * ============================================================================
 */