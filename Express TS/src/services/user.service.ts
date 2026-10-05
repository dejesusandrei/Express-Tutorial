import * as userRepository from '../repositories/user.repository'
import type { User } from '../types/User'
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

export const deleteUser = async (
  id: string
): Promise<User> => {
  const user = await userRepository.deleteById(id);

  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  return user;
};