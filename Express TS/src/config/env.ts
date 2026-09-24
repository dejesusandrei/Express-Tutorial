import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  // z.coerce.number() converts it to string > number
  PORT: z.coerce.number().default(3000),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters"),

  FRONTEND_URL: z
  .string()
  .url("FRONTEND_URL must be a valid URL"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(
    "Invalid environment variables:",
    parsedEnv.error.flatten().fieldErrors
  );

  process.exit(1);
}

export const env = {
  port: parsedEnv.data.PORT,
  nodeEnv: parsedEnv.data.NODE_ENV,
  jwtSecret: parsedEnv.data.JWT_SECRET,
  frontendUrl: parsedEnv.data.FRONTEND_URL,
};