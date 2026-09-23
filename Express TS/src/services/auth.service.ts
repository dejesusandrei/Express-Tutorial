import argon2 from "argon2";
import crypto from "node:crypto";

import type { User } from "../types/User.js";
import type { RegisterInput } from "../schema/user.schema.js";

import { generateAccessToken } from "../utils/jwt.js";
import * as userRepository from "../repositories/user.repository.js";
import { LoginInput } from "../schema/auth.schema.js";
import { AppError } from "../errors/AppError.js";
import { LoginResult } from "../types/Login.js";

export const register = async (
  data: RegisterInput
): Promise<User> => {
  const { name, email, password } = data;

  const passwordHash = await argon2.hash(password);

  const user: User = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash,
    role: 'user'
  };

  return userRepository.create(user);
};

export const login = async (
  data: LoginInput
): Promise<LoginResult> => {
  const { email, password } = data;
  
  const user = await userRepository.findByEmail(email);
  
  if(!user){
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIAL');
  }

  const passwordValid = await argon2.verify(user.passwordHash, password);

  if(!passwordValid){
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIAL');
  }

  const accessToken = generateAccessToken(user.id);

  return {
    user,
    accessToken
  };
}