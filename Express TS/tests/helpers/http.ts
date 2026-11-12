
import request from "supertest";

import app from "../../src/app.js";
import { env } from "../../src/config/env.config.js";
import { query } from "../../src/utils/databaseQueryHelper.js";
import { clearOutbox } from "./emailOutbox.js";

/**
 * ============================================================================
 * HTTP TEST HELPERS
 * ============================================================================
 * Ang file na ito ay naglalaman ng reusable helpers para sa API integration
 * tests natin.
 *
 * Ginagamit natin ang Supertest para makapag-send ng HTTP requests sa Express
 * app without manually starting a server or opening a port.
 *
 * Bakit may helpers?
 * Para hindi paulit-ulit magsulat ng request setup sa bawat test.
 * Mas maikli at mas madaling basahin ang test files natin.
 * ============================================================================
 */


/**
 * FRONTEND ORIGIN
 *
 * Sa actual browser, automatic na nagpapadala ang browser ng Origin header
 * kapag gumagawa ng cross-origin requests.
 *
 * Pero ang Supertest ay hindi actual browser, kaya kailangan natin itong
 * idagdag manually.
 *
 * Kinukuha natin ang origin mula sa FRONTEND_URL sa environment variables.
 *
 * Example:
 * FRONTEND_URL = http://localhost:5173
 * FRONTEND_ORIGIN = http://localhost:5173
 *
 * Ginagamit ito sa verifyOrigin middleware para ma-test kung valid ang
 * request origin.
 */
export const FRONTEND_ORIGIN = new URL(env.frontendUrl).origin;


/**
 * POST REQUEST WITH VALID ORIGIN
 *
 * Gumagawa ng POST request at automatic na nilalagyan ng valid Origin header.
 *
 * Gamitin ito sa endpoints na dumadaan sa verifyOrigin middleware,
 * gaya ng register, login, refresh, at iba pang protected auth operations.
 *
 * Example:
 * await post("/api/auth/login").send({
 *   email: "test@example.com",
 *   password: "password123"
 * });
 */
export const post = (path: string) =>
  request(app).post(path).set("Origin", FRONTEND_ORIGIN);


/**
 * POST REQUEST WITHOUT ORIGIN
 *
 * Gumagawa ng POST request na walang Origin header.
 *
 * Ginagamit ito para i-test kung hinaharang ng verifyOrigin middleware
 * ang requests na walang Origin.
 *
 * Example:
 * await postWithoutOrigin("/api/auth/login");
 */
export const postWithoutOrigin = (path: string) => request(app).post(path);


/**
 * POST REQUEST WITH CUSTOM ORIGIN
 *
 * Gumagawa ng POST request gamit ang sarili nating Origin value.
 *
 * Useful ito kapag gusto nating subukan ang invalid o unauthorized origin.
 *
 * Example:
 * await postWithOrigin(
 *   "/api/auth/login",
 *   "http://malicious-site.com"
 * );
 */
export const postWithOrigin = (path: string, origin: string) =>
  request(app).post(path).set("Origin", origin);


/**
 * SIMPLE GET REQUEST
 *
 * Gumagawa ng ordinary GET request sa specified endpoint.
 *
 * Example:
 * await get("/api/health");
 */
export const get = (path: string) => request(app).get(path);


/**
 * GET REQUEST WITH ACCESS TOKEN
 *
 * Gumagawa ng GET request na may Authorization header.
 *
 * Ginagamit ito kapag kailangan ng endpoint ng authenticated user.
 *
 * Ang Bearer token ay ang access JWT na nakuha pagkatapos mag-login.
 *
 * Example:
 * await getAs("/api/users/me", accessToken);
 *
 * Katumbas nito ang:
 * GET /api/users/me
 * Authorization: Bearer <accessToken>
 */
export const getAs = (path: string, accessToken: string) =>
  request(app).get(path).set("Authorization", `Bearer ${accessToken}`);


/**
 * REGISTER USER HELPER
 *
 * Gumagawa ng bagong user gamit ang actual registration API.
 *
 * Hindi tayo direktang nag-i-insert ng user sa database.
 * Dadaan pa rin tayo sa registration route, validation, controller,
 * service, at repository.
 *
 * May default name na "Test User" kapag walang ibinigay na name.
 *
 * Example:
 * await registerUser("test@example.com", "Password123!");
 */
export const registerUser = (
  email: string,
  password: string,
  name = "Test User"
) =>
  post("/api/auth/register").send({
    name,
    email,
    password,
  });


/**
 * LOGIN USER HELPER
 *
 * Nagpapadala ng login request gamit ang email at password.
 *
 * Actual login endpoint ang ginagamit nito, kaya kasama sa test ang
 * validation, password verification, at token generation.
 *
 * Example:
 * await loginUser("test@example.com", "Password123!");
 */
export const loginUser = (email: string, password: string) =>
  post("/api/auth/login").send({
    email,
    password,
  });


/**
 * CREATE VERIFIED USER
 *
 * Gumagawa muna ng user gamit ang actual registration API.
 *
 * Pagkatapos, direkta nating ina-update ang database para markahan
 * ang email bilang verified.
 *
 * Bakit hindi dumaan sa actual email verification flow?
 * Dahil may sarili tayong tests para sa email verification.
 * Sa ibang tests, gusto lang natin ng existing verified user para
 * makapag-focus sa ibang functionality.
 *
 * Steps:
 * 1. Register user through the real API.
 * 2. Update email_verified_at sa database.
 * 3. Clear the fake email outbox para walang mail na maiiwan mula
 *    sa previous test.
 *
 * Example:
 * await createVerifiedUser("test@example.com", "Password123!");
 */
export const createVerifiedUser = async (
  email: string,
  password: string
) => {
  await registerUser(email, password);

  await query(
    "UPDATE users SET email_verified_at = NOW() WHERE email = $1",
    [email]
  );

  // Linisin ang fake email storage para fresh ang susunod na test.
  clearOutbox();
};


/**
 * EXTRACT REFRESH TOKEN COOKIE
 *
 * Pagkatapos mag-login, maaaring mag-send ang server ng Set-Cookie header
 * na naglalaman ng refreshToken.
 *
 * Kinukuha ng helper na ito ang refreshToken cookie mula sa response.
 *
 * Bakit kailangan?
 * Para magamit natin ang cookie sa mga susunod na tests, gaya ng:
 * - Refresh token rotation
 * - Logout
 * - Refresh token reuse detection
 *
 * Ang cookie ay string, halimbawa:
 * "refreshToken=abc123"
 *
 * Inaalis natin ang ibang cookie attributes gaya ng Path, HttpOnly,
 * SameSite, at Secure dahil ang kailangan lang natin dito ay ang
 * mismong cookie name at value.
 */
export const cookieFrom = (res: request.Response): string | undefined => {
  const raw = res.headers["set-cookie"] as unknown;

  // Puwedeng array o single value ang Set-Cookie header.
  // Kaya kino-convert natin ito into a string array.
  const list: string[] = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];

  // Hanapin ang refreshToken cookie at kunin lang ang name=value portion.
  return list.find((c) => c.startsWith("refreshToken="))?.split(";")[0];
};


/**
 * EXTRACT TOKEN FROM EMAIL LINK
 *
 * Ang fake email sender natin ay nagse-save ng email sa outbox.
 * Karaniwang may verification o password reset link ang email.
 *
 * Ang helper na ito ay kumukuha ng token mula sa URL query parameter.
 *
 * Example link:
 * http://localhost:5173/reset-password?token=abc123
 *
 * Kapag tinawag:
 * tokenFromLink(link);
 *
 * Result:
 * "abc123"
 *
 * Kapag walang token sa URL, empty string ang ibabalik.
 */
export const tokenFromLink = (link: string): string =>
  new URL(link).searchParams.get("token") ?? "";
