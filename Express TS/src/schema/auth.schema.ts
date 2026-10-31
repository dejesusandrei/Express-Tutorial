import { z } from "zod";
import { loginPasswordSchema } from "./password.schema.js";

export const LoginSchema = z.object({
  email: z
    .string()
    .email("Invalid email address"),

  password: loginPasswordSchema,
});

export type LoginInput = z.infer<typeof LoginSchema>;