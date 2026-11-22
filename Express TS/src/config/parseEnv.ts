
import { z } from "zod";

/**
 * ============================================================================
 * parseEnv: parang checklist ng ingredients bago magbukas ang kitchen
 * ============================================================================
 * Bago magluto, chine-check muna kung kumpleto ang ingredients.
 * Kapag may kulang, dapat malaman agad bago magsimula.
 *
 * Ganito rin ang ginagawa ng parseEnv. Chine-check nito ang lahat ng
 * environment settings isang beses sa startup:
 *   - May kulang o maling value -> hindi mag-start ang server at ililista
 *     lahat ng problems.
 *   - Lahat ay valid -> magbibigay ng typed at frozen settings object.
 *
 * Pure function ito: ang binabasa lang nito ay ang values na ipinasa sa kanya.
 * Kapag may mali, nagti-throw ito ng error pero hindi tumatawag ng process.exit.
 * Kaya madali rin itong i-test gamit ang unit tests.
 *
 * Ang src/config/env.ts lang ang dapat direktang gumamit ng process.env.
 * ============================================================================
 */

// Mga secret na nagsisimula sa mga value na ito ay malamang placeholder pa
// at hindi pa napapalitan ng totoong random secret.
const PLACEHOLDER_SECRET =
  /^(change[-_ ]?me|secret|password|your[-_ ]?secret|replace[-_ ]?me|example|test[-_ ]?secret)/i;

// Mga valid na log levels na puwedeng gamitin sa Pino logger.
const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    // Text ang values sa .env (halimbawa, "3000").
    // Ginagawang number ng coerce para magamit bilang port.
    // Ang int at min/max ay para siguraduhing valid ang port number.
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    // URL ng frontend na pinapayagang tumawag sa API.
    // Ginagamit din ito sa CORS at CSRF Origin checking.
    FRONTEND_URL: z.string().url("must be a valid URL"),

    // ---- DATABASE ------------------------------------------------------

    // Database connection settings.
    // Kapag walang DB_HOST o DB_PORT, gagamitin ang default values.
    DB_HOST: z.string().min(1).default("localhost"),
    DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
    DB_NAME: z.string().min(1),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),

    // Kung gagamit ng SSL/TLS encryption sa connection papuntang PostgreSQL.
    // Usually, kailangan ito kapag kumokonekta sa hosted database gamit ang public network.
    DB_SSL: z.enum(["true", "false"]).default("false"),

    // ---- SECRETS: walang default value para dito -----------------------

    // Walang default ang JWT_SECRET para hindi aksidenteng gumamit
    // ang app ng publicly known secret.
    JWT_SECRET: z
      .string()
      .min(32, "must be at least 32 characters")
      .refine((value) => !PLACEHOLDER_SECRET.test(value), {
        message: "looks like a placeholder. Generate a random one",
      }),

    // Optional na log level. Kapag walang value, gagamitin ng logger
    // ang sarili nitong default setting.
    LOG_LEVEL: z.enum(LOG_LEVELS).optional(),

    // Kung ipapakita ang interactive API documentation sa /api/docs.
    // Kapag hindi ito naka-set, naka-enable sa development at test,
    // pero naka-disable sa production.
    API_DOCS_ENABLED: z.enum(["true", "false"]).optional(),

    // Ilang reverse proxies ang nasa harap ng Express app.
    // 0 = walang trusted proxy.
    // Usually 1 kapag naka-host sa Render, Railway, o nasa likod ng Nginx.
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),

    // SameSite setting ng refresh-token cookie.
    // lax    : Para sa frontend at API na nasa same site.
    // strict : Mas mahigpit na cookie policy; same-site requests lang.
    // none   : Para sa cross-site requests, tulad ng Vercel frontend at Render API.
    //          Kailangan nitong naka-Secure ang cookie at naka-HTTPS.
    // Kapag none ang gamit, ang verifyOrigin ang pangunahing CSRF protection.
    COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  })

  // Mga validation na nangangailangan ng higit sa isang environment setting.
  .superRefine((value, ctx) => {
    // Sa production, dapat HTTPS ang frontend URL para secure ang communication.
    if (
      value.NODE_ENV === "production" &&
      !value.FRONTEND_URL.startsWith("https://")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["FRONTEND_URL"],
        message: "must start with https:// in production",
      });
    }

    // Hindi tatanggapin ng browser ang SameSite=None cookie kapag walang Secure.
    // Secure lang ang cookies natin sa production, kaya production lang
    // puwedeng gumamit ng COOKIE_SAMESITE=none.
    if (value.COOKIE_SAMESITE === "none" && value.NODE_ENV !== "production") {
      ctx.addIssue({
        code: "custom",
        path: ["COOKIE_SAMESITE"],
        message: "can only be 'none' in production (the cookie must be Secure)",
      });
    }
  });

export const parseEnv = (raw: Record<string, string | undefined>) => {
  // Tinatanggal ang undefined at empty string values.
  // Halimbawa, kapag PORT= lang ang nasa .env, ituturing natin itong
  // walang value para hindi ito maging number na 0.
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== undefined && value !== "")
  );

  // Chine-check kung pasok sa schema ang lahat ng environment settings.
  const result = envSchema.safeParse(cleaned);

  if (!result.success) {
    // Kinukuha ang pangalan ng setting at dahilan kung bakit invalid.
    // Hindi natin isinasama ang actual value dahil maaaring secret ito
    // at mapunta sa application logs.
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    // Ititigil ang parsing at magbibigay ng error kapag may invalid setting.
    throw new Error(
      `Invalid environment configuration:\n${problems}\n` +
        "Fix your .env file (see .env.example)."
    );
  }

  // Lahat ng settings ay valid na, kaya puwede na nating gamitin ang result.
  const value = result.data;

  // Ibabalik ang environment settings gamit ang consistent naming convention.
  // Object.freeze() para maiwasan ang accidental changes habang tumatakbo ang app.
  return Object.freeze({
    nodeEnv: value.NODE_ENV,
    isProduction: value.NODE_ENV === "production",
    isTest: value.NODE_ENV === "test",
    port: value.PORT,
    frontendUrl: value.FRONTEND_URL,
    jwtSecret: value.JWT_SECRET,
    logLevel: value.LOG_LEVEL,
    trustProxy: value.TRUST_PROXY,
    cookieSameSite: value.COOKIE_SAMESITE,

    // Kapag may explicit setting sa .env, iyon ang susundin.
    // Kung wala, enabled ang docs sa development/test at disabled sa production.
    docsEnabled:
      value.API_DOCS_ENABLED !== undefined
        ? value.API_DOCS_ENABLED === "true"
        : value.NODE_ENV !== "production",

    // Database configuration na naka-group sa db object.
    // Ginagawang boolean ang DB_SSL para true/false na ang gamitin sa code.
    db: Object.freeze({
      host: value.DB_HOST,
      port: value.DB_PORT,
      name: value.DB_NAME,
      user: value.DB_USER,
      password: value.DB_PASSWORD,
      ssl: value.DB_SSL === "true",
    }),
  });
};

// Kinukuha ang TypeScript type base sa actual return value ng parseEnv.
export type Env = ReturnType<typeof parseEnv>;
