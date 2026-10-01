import { z } from 'zod'

export const CreateTaskSchema = z.object({
  title: 
    z.string()
    .trim()
    .min(2, 'minimum 3 characters')
    .max(100, 'maximum 200 characters'),

  completed: 
    z.boolean()
    .optional()
    .default(false)
});

export const UpdateTaskSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must not exceed 200 characters"),

  completed: z.boolean()
});

export const TaskIdSchema = z.object({
  id: z.string().uuid("Invalid task ID")
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;