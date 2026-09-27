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

  DB_HOST: z.string().default("localhost"),

  DB_PORT: z.coerce
    .number()
    .default(5432),

  DB_NAME: z.string().min(1),

  DB_USER: z.string().min(1),

  DB_PASSWORD: z.string().min(1)
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

  db: {
    host: parsedEnv.data.DB_HOST,
    port: parsedEnv.data.DB_PORT,
    name: parsedEnv.data.DB_NAME,
    user: parsedEnv.data.DB_USER,
    password: parsedEnv.data.DB_PASSWORD
  },
};