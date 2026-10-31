export type UserRole = "user" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
  failed_login_attempts: number;
  locked_until: Date | null;
};

export type CreateUserData = {
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
};