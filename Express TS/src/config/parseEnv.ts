import { z } from "zod";

/**
 * ============================================================================
 * parseEnv: the "ingredient checklist" before the kitchen opens
 * ============================================================================
 * A good cook checks the ingredients BEFORE turning on the stove. If the eggs
 * are missing, stop right away instead of discovering it halfway.
 *
 * Same here. parseEnv checks every setting once, at startup:
 *   - missing or wrong -> the server REFUSES TO START and lists every problem
 *   - fine             -> you get a typed, frozen settings object
 *
 * It is a pure function: it only reads what you hand it and it THROWS on
 * failure (it does not call process.exit). That makes it easy to unit test.
 * src/config/env.ts is the only caller that uses process.env.
 * ============================================================================
 */

// Secrets that start like these were copied from an example and never replaced.
const PLACEHOLDER_SECRET =
  /^(change[-_ ]?me|secret|password|your[-_ ]?secret|replace[-_ ]?me|example|test[-_ ]?secret)/i;

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

    // .env values are always TEXT ("3000"). coerce turns them into numbers.
    // int + min/max: without the range, PORT=0 or PORT=99999 would be accepted.
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    // The ONE website allowed to call this API (CORS + CSRF origin check).
    FRONTEND_URL: z.string().url("must be a valid URL"),

    // ---- DATABASE ------------------------------------------------------
    DB_HOST: z.string().min(1).default("localhost"),
    DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
    DB_NAME: z.string().min(1),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),

    // ---- SECRETS: no default on purpose ---------------------------------
    // A default would let the app start with a known, public secret.
    JWT_SECRET: z
      .string()
      .min(32, "must be at least 32 characters")
      .refine((value) => !PLACEHOLDER_SECRET.test(value), {
        message: "looks like a placeholder. Generate a random one",
      }),

    LOG_LEVEL: z.enum(LOG_LEVELS).optional(),

    // How many reverse proxies sit in front of the app (0 = none).
    // Render, Railway, and Nginx setups are usually 1.
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  })
  // Rules that depend on more than one value.
  .superRefine((value, ctx) => {
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
  });

export const parseEnv = (
  raw: Record<string, string | undefined>
) => {
  // "PORT=" (empty) in a .env file means "not set", not "set to nothing".
  // Without this, Number("") is 0, so PORT= would silently become port 0.
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== undefined && value !== "")
  );

  const result = envSchema.safeParse(cleaned);

  if (!result.success) {
    // We print only the NAME of each bad setting and what is wrong with it.
    // NEVER the value: it may be a secret, and this message ends up in logs.
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid environment configuration:\n${problems}\n` +
        "Fix your .env file (see .env.example)."
    );
  }

  const value = result.data;

  // Friendly names, frozen so nothing can change them while the app runs.
  // The shape (env.port, env.db.host...) is the same one the rest of the
  // project already uses.
  return Object.freeze({
    nodeEnv: value.NODE_ENV,
    isProduction: value.NODE_ENV === "production",
    isTest: value.NODE_ENV === "test",
    port: value.PORT,
    frontendUrl: value.FRONTEND_URL,
    jwtSecret: value.JWT_SECRET,
    logLevel: value.LOG_LEVEL,
    trustProxy: value.TRUST_PROXY,

    db: Object.freeze({
      host: value.DB_HOST,
      port: value.DB_PORT,
      name: value.DB_NAME,
      user: value.DB_USER,
      password: value.DB_PASSWORD,
    }),
  });
};

export type Env = ReturnType<typeof parseEnv>;