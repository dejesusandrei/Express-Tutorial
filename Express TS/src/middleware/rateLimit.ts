import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError.js";

/**
 * ============================================================================
 * RATE LIMITING: the "candy jar rule"
 * ============================================================================
 * Each visitor (identified by IP address) may make only N requests in a time
 * window. Over the limit, the guard says "come back later": 429.
 *
 * What it stops: brute force, credential stuffing, fake-account spam, email
 * bombing, and basic flooding. Each route gets its own limit, because the
 * risk differs: login is dangerous (strict), a normal page is harmless (loose).
 * ============================================================================
 */

// What happens when someone goes over the limit: pass an AppError to next(),
// so errorHandler formats it like every other error. The library adds the
// Retry-After header (seconds to wait) by itself.
const tooManyRequests = (message: string) =>
  (_req: Request, _res: Response, next: NextFunction) =>
    next(new AppError(message, 429, "TOO_MANY_REQUESTS"));

/**
 * TEST-ONLY RATE LIMIT BYPASS
 *
 * Kapag nag-i-integration test tayo, maaaring paulit-ulit tayong mag-login
 * o mag-request sa API. Baka maabot agad ang rate limit kahit testing lang.
 *
 * Kaya may switch tayo para pansamantalang i-skip ang rate limiting.
 *
 * Pero dalawang conditions ang kailangang matupad:
 * 1. NODE_ENV must be "test".
 * 2. DISABLE_RATE_LIMIT must be "true".
 *
 * Kapag production environment, hindi gagana ang bypass na ito kahit
 * aksidenteng naka-set sa "true" ang DISABLE_RATE_LIMIT.
 *
 * Ang DISABLE_RATE_LIMIT ay sine-set sa test/setup/env.ts.
 */
const skipInTests = (): boolean =>
  process.env.NODE_ENV === "test" &&
  process.env.DISABLE_RATE_LIMIT === "true";


/**
 * LIMITER FACTORY
 *
 * Sa halip na ulit-ulitin ang parehong rateLimit configuration sa bawat
 * route, gumawa tayo ng reusable function na createLimiter().
 *
 * Dito natin ibibigay ang:
 * - windowMs: gaano katagal ang counting period.
 * - limit: ilang requests ang allowed sa period na iyon.
 * - message: message kapag naabot ang limit.
 * - skipSuccessfulRequests: kung true, hindi bibilangin ang successful
 *   requests; kapag false, kasama ang successful requests sa count.
 *
 * Ang ?? false ay nangangahulugang kapag hindi natin binigyan ng value
 * ang skipSuccessfulRequests, automatic na false ang gagamitin.
 */
const createLimiter = (options: {
  windowMs: number; // Tagal ng time window, naka-milliseconds.
  limit: number; // Maximum number of requests per IP.
  message: string; // Error message kapag lumampas sa limit.
  skipSuccessfulRequests?: boolean; // I-skip ba sa count ang successful requests?
}) => rateLimit({
  windowMs: options.windowMs,
  limit: options.limit,
  skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
  standardHeaders: "draft-8", // Modern RateLimit headers para makita ang remaining quota.
  legacyHeaders: false, // Huwag nang mag-send ng old X-RateLimit headers.
  skip: skipInTests, // I-skip ang limiter kapag test environment at enabled ang bypass.
  handler: tooManyRequests(options.message), // Custom handler kapag lumampas sa limit.
});

const MINUTES = 60 * 1000;
const HOURS = 60 * MINUTES;

// 1. GLOBAL: a loose net for the whole API (300 per 15 minutes)
export const globalRateLimit = createLimiter({
  windowMs: 15 * MINUTES,
  limit: 300,
  message: "Too many requests. Please slow down.",
});

// 2. LOGIN: the strictest. 5 FAILED attempts per 15 minutes.
// skipSuccessfulRequests: a correct login doesn't use up the counter, so a
// real user who logs in normally is never blocked.
export const loginRateLimit = createLimiter({
  windowMs: 15 * MINUTES,
  limit: 5,
  skipSuccessfulRequests: true,
  message: "Too many login attempts. Try again in 15 minutes.",
});

// 3. REGISTER: stop fake-account spam. 5 sign-ups per hour.
export const registerRateLimit = createLimiter({
  windowMs: 1 * HOURS,
  limit: 5,
  message: "Too many accounts created. Try again later.",
});

// 4. REFRESH: humans call it about every 15 minutes, so 30 per 15 minutes is
// generous for them but stops hammering.
export const refreshRateLimit = createLimiter({
  windowMs: 15 * MINUTES,
  limit: 30,
  message: "Too many refresh requests. Try again later.",
});

// 5. FORGOT-PASSWORD: every request can send an email, so this stops email
// bombing (flooding someone's inbox). 3 per hour.
export const forgotPasswordRateLimit = createLimiter({
  windowMs: 1 * HOURS,
  limit: 3,
  message: "Too many reset requests. Try again later.",
});

// 6. RESET-PASSWORD: the token is 64 random hex characters, so guessing is
// hopeless anyway. A cheap extra layer. 10 per hour.
export const resetPasswordRateLimit = createLimiter({
  windowMs: 1 * HOURS,
  limit: 10,
  message: "Too many attempts. Try again later.",
});

// 7. RESEND-VERIFICATION: stops email bombing. 3 per hour.
export const resendVerificationRateLimit = createLimiter({
  windowMs: 1 * HOURS,
  limit: 3,
  message: "Too many requests. Try again later.",
});

// 8. VERIFY-EMAIL: a cheap extra layer against token guessing. 10 per hour.
export const verifyEmailRateLimit = createLimiter({
  windowMs: 1 * HOURS,
  limit: 10,
  message: "Too many attempts. Try again later.",
});

/**
 * ============================================================================
 * THINGS TO REMEMBER
 * ============================================================================
 * 1. WHO IS "THE VISITOR"? By default req.ip. Behind a proxy (Render, Railway,
 *    Nginx, Cloudflare) every request looks like it comes from the PROXY, so
 *    everybody would share one counter. When deployed behind exactly one
 *    proxy, set in app.ts:  app.set("trust proxy", 1);
 *    Never set it to true blindly: an attacker could fake X-Forwarded-For and
 *    get a fresh counter on every request.
 *
 * 2. MEMORY STORE: counters live in the server's memory. A restart resets
 *    them, and two server copies each keep their own. In production use a
 *    shared store such as Redis (rate-limit-redis).
 *
 * 3. IP limits aren't perfect: attackers rotate IPs, and many real users can
 *    share one IP. That's why login ALSO has per-account lockout.
 * ============================================================================
 */