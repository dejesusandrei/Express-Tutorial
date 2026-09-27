import type { User, CreateUserData } from '../types/User'
import { pool } from "../config/database.js";

const users: User[] = [];

export const findAll = async (): Promise<User[]> => {
  const result = await pool.query(
    `
      SELECT id, name, email, password_hash, role, created_at
      FROM users
      ORDER BY created_at DESC
    `
  );

  return result.rows;
};

export const findById = async (
  id: string
): Promise<User | undefined> => {
  const result = await pool.query(
    `
      SELECT id, name, email, role, password_hash, created_at
      FROM users
      WHERE id = $1
    `,
    [id]
  );

  return result.rows[0];
};

export const findByEmail = async (
  email: string
): Promise<User | undefined> =>{
  const result = await pool.query(
    `
      SELECT id, name, email, role, password_hash, created_at
      FROM users
      WHERE LOWER(email) = LOWER($1)
    `,
    [email]
  );

  return result.rows[0];
}

export const create = async (
  user: CreateUserData
): Promise<User> => {
  const result = await pool.query(
    `
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING name, email, password_hash, role, created_at
    `,
    [
      user.name,
      user.email,
      user.password_hash,
      user.role
    ]
  );

  return result.rows[0];
}

export const deleteById = async (
  id: string
): Promise<User | undefined> => {
  const result = await pool.query<User>(
    `
      DELETE FROM users
      WHERE id = $1
      RETURNING *;
    `,
    [id]
  );

  return result.rows[0];
}