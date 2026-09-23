import { z } from 'zod'

export const CreateTaskSchema = z.object({
  title: 
    z.string()
    .min(2, 'minimum 3 characters')
    .max(100, 'maximum 200 characters'),

  completed: 
    z.boolean(),

  ownerId:
    z.string()
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;