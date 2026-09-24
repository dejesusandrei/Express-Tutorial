import { z } from 'zod'

export const CreateUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must not exceed 100 characters"),
  email: z
    .string()
    .trim()
    .email("Invalid email address"),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
});

export type RegisterInput = z.infer<typeof CreateUserSchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;