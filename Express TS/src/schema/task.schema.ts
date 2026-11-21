import { z } from "zod";

/**
 * ============================================================================
 * TASK INPUT CHECKERS
 * ============================================================================
 * Create and update used to have DIFFERENT rules (2-100 and 1-200), and the
 * error messages said numbers that were not the real ones ("minimum 3",
 * "maximum 200"). Now the limits live in ONE place, and the messages are built
 * from them, so they can never lie.
 *
 * To change the rule, change TITLE_MIN / TITLE_MAX below. That's all.
 * ============================================================================
 */
const TITLE_MIN = 2;
const TITLE_MAX = 100;

const titleSchema = z
  .string()
  // trim FIRST: "   " becomes "" and is then rejected by min(). Before, the
  // update schema had no trim, so a title made only of spaces was accepted.
  .trim()
  .min(TITLE_MIN, `Title must be at least ${TITLE_MIN} characters`)
  .max(TITLE_MAX, `Title must not exceed ${TITLE_MAX} characters`);

export const CreateTaskSchema = z.object({
  title: titleSchema,
  completed: z.boolean().optional().default(false),
});

// PUT replaces the task, so both fields are required.
export const UpdateTaskSchema = z.object({
  title: titleSchema,
  completed: z.boolean(),
});

// Unknown fields (for example owner_id) are silently DROPPED by z.object().
// The owner always comes from the login token, never from the request body.

export const TaskIdSchema = z.object({
  id: z.string().uuid("Invalid task ID"),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;