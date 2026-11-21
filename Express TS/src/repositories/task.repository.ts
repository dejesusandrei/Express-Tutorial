import type { Task, CreateTaskData } from "../types/Task.js";
import { query } from "../utils/databaseQueryHelper.js";

/**
 * ============================================================================
 * TASK REPOSITORY
 * ============================================================================
 * OWNERSHIP RULE: every function that reads or changes ONE task also filters
 * by owner_id. The owner id comes from the verified token, never from the
 * request body or URL. That one habit prevents IDOR (reading or changing
 * someone else's data by guessing an id).
 * ============================================================================
 */

const TASK_COLUMNS = "id, owner_id, title, completed, created_at";

// Not used by the controllers anymore (they use findAllPaginated). An
// unbounded list is a risk, so consider deleting this and getTask in the
// service.
export const findAll = async (owner_id: string): Promise<Task[]> => {
  const result = await query<Task>(
    `
      SELECT ${TASK_COLUMNS}
      FROM tasks
      WHERE owner_id = $1
      ORDER BY created_at DESC
    `,
    [owner_id]
  );

  return result.rows;
};

export const findById = async (
  id: string,
  owner_id: string
): Promise<Task | undefined> => {
  const result = await query<Task>(
    `
      SELECT ${TASK_COLUMNS}
      FROM tasks
      WHERE id = $1 AND owner_id = $2
    `,
    [id, owner_id]
  );

  return result.rows[0];
};

export const create = async (task: CreateTaskData): Promise<Task> => {
  const result = await query<Task>(
    `
      INSERT INTO tasks (owner_id, title, completed)
      VALUES ($1, $2, $3)
      RETURNING ${TASK_COLUMNS}
    `,
    [task.owner_id, task.title, task.completed ?? false]
  );

  return result.rows[0];
};

export const updateForUser = async (
  taskId: string,
  owner_id: string,
  title: string,
  completed: boolean
): Promise<Task | undefined> => {
  const result = await query<Task>(
    `
      UPDATE tasks
      SET title = $1, completed = $2
      WHERE id = $3 AND owner_id = $4
      RETURNING ${TASK_COLUMNS}
    `,
    [title, completed, taskId, owner_id]
  );

  return result.rows[0];
};

export const deleteByIdForUser = async (
  taskId: string,
  owner_id: string
): Promise<Task | undefined> => {
  const result = await query<Task>(
    `
      DELETE FROM tasks
      WHERE id = $1 AND owner_id = $2
      RETURNING ${TASK_COLUMNS}
    `,
    [taskId, owner_id]
  );

  return result.rows[0];
};

// The ORDER BY has a tie-breaker (id). Without it, two tasks created in the
// same instant can swap places between pages, so one appears twice and
// another never.
// This query is what the composite index (owner_id, created_at DESC, id DESC)
// in 006_indexes.sql is made for.
export const findAllPaginated = async (
  owner_id: string,
  limit: number,
  offset: number
): Promise<Task[]> => {
  const result = await query<Task>(
    `
      SELECT ${TASK_COLUMNS}
      FROM tasks
      WHERE owner_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2 OFFSET $3
    `,
    [owner_id, limit, offset]
  );

  return result.rows;
};

export const countByOwner = async (owner_id: string): Promise<number> => {
  const result = await query<{ count: string }>(
    `
      SELECT COUNT(*) AS count
      FROM tasks
      WHERE owner_id = $1
    `,
    [owner_id]
  );

  // COUNT returns a bigint, which pg gives back as a string.
  return Number(result.rows[0].count);
};