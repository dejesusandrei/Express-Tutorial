import argon2 from "argon2";

import type { User } from "../types/User.js";
import type { CreateUserInput } from "../schema/user.schema.js";

import { generateAccessToken } from "../utils/jwt.js";
import {generateRefreshToken, hashRefreshToken } from "../utils/refreshToken.js"

import * as userRepository from "../repositories/user.repository.js";
import * as refreshTokenRepository from "../repositories/refreshToken.repository.js";
import { LoginInput } from "../schema/auth.schema.js";
import { AppError } from "../errors/AppError.js";
import { LoginResult } from "../types/Login.js";

const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export const register = async (
  data: CreateUserInput
): Promise<User> => {
  const { name, email, password } = data;

  const password_hash = await argon2.hash(password);

  const user = await userRepository.create({
    name,
    email,
    password_hash,
    role: "user"
  });

  return user;
};

export const login = async (
  data: LoginInput
): Promise<LoginResult> => {
  const { email, password } = data;
  
  const user = await userRepository.findByEmail(email);
  
  if(!user){
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const passwordValid = await argon2.verify(user.password_hash, password);

  if(!passwordValid){
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  // Generate access token and refresh token
  const accessToken = generateAccessToken(user.id);

  // Generate refresh token and hash it
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);

  // Set the expiration date for the refresh token
  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  );

  await refreshTokenRepository.createrefreshToken(
    user.id,
    tokenHash,
    expiresAt
  );


  return {
    user,
    accessToken,
    refreshToken
  };
}