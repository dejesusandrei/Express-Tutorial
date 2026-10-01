import type { Task, CreateTaskData } from '../types/Task'
import { pool } from "../config/database.js";

export const findAll = async (
  owner_id: string
): Promise<Task[]> => {
  const result = await pool.query<Task>(
    `
      SELECT id, owner_id, title, completed, created_at
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
  const result = await pool.query(
    `
      SELECT id, owner_id, title, completed, created_at
      FROM tasks
      WHERE id = $1 AND owner_id = $2
    `,
    [id, owner_id]
  );

  return result.rows[0];
};

export const create = async (
  task: CreateTaskData
): Promise<Task> => {
  const result = await pool.query(
      `
        INSERT INTO tasks (owner_id, title, completed)
        VALUES ($1, $2, $3)
        RETURNING id, owner_id, title, completed, created_at
      `,
      [
        task.owner_id,
        task.title,
        task.completed ?? false
      ]
    );
  
    return result.rows[0];
};

export const updateForUser = async (
  taskId: string,
  owner_id: string,
  title: string,
  completed: boolean
): Promise<Task | undefined> => {
  const result = await pool.query<Task>(
    `
      UPDATE tasks
      SET
        title = $1,
        completed = $2
      WHERE id = $3 AND owner_id = $4
      RETURNING id, owner_id, title, completed, created_at
    `,
    [
      title,
      completed,
      taskId,
      owner_id
    ]
  );

  return result.rows[0];
};

export const deleteById = async (
  id: string
): Promise<Task | undefined> => {
  const result = await pool.query<Task>(
    `
      DELETE FROM tasks
      WHERE id = $1
      RETURNING *;
    `,
    [id]
  );

  return result.rows[0];
}