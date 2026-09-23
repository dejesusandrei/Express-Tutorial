import argon2 from "argon2";
import crypto from "node:crypto";

import * as userRepository from '../repositories/user.repository'
import type { User } from '../types/User'
import type { CreateUserInput } from "../schema/user.schema.js";
import { AppError } from "../errors/AppError.js";

export const getUsers = async (): Promise<User[]> => {
  return userRepository.findAll();
};

export const getUserById = async (id: string): Promise<User> => {
  const user = await userRepository.findById(id);

  if(!user){
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  return user;
};

export const createUser = async (
  data: CreateUserInput
): Promise<User> => {
  const { name, email, password } = data;

  const existingUser = (await userRepository.findAll()).find(user => user.email === email);

  if (existingUser) {
    // 409: COnflict
    throw new AppError("Email already registered", 409, "EMAIL_ALREADY_EXISTS");
  }

  const passwordHash = await argon2.hash(password);

  const user: User = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash,
    role: "user"
  };

  return userRepository.create(user);
}


export const deleteUser = async (
  id: string
): Promise<User> => {
  const user = await userRepository.deleteById(id);

  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  return user;
};