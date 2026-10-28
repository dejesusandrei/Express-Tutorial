import argon2 from "argon2";

import type { User } from "../types/User.js";
import type { CreateUserInput } from "../schema/user.schema.js";
import type { LoginInput } from "../schema/auth.schema.js";
import type { LoginResult } from "../types/Login.js";

import { generateAccessToken } from "../utils/jwt.js";
import { generateRefreshToken, hashRefreshToken } from "../utils/refreshToken.js";

import * as userRepository from "../repositories/user.repository.js";
import * as refreshTokenRepository from "../repositories/refreshToken.repository.js";
import { AppError } from "../errors/AppError.js";

export const REFRESH_TOKEN_EXPIRY_DAYS = 7;

// One place to compute the expiry date, so login and refresh can't drift apart.
const getRefreshTokenExpiry = (): Date =>
  new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// REGISTER
// Hash the password with argon2, then save the user.
// The controller strips password_hash before sending the response.
// ---------------------------------------------------------------------------
export const register = async (
  data: CreateUserInput
): Promise<User> => {
  const { name, email, password } = data;

  const password_hash = await argon2.hash(password);

  return userRepository.create({
    name,
    email,
    password_hash,
    role: "user"
  });
};

// ---------------------------------------------------------------------------
// LOGIN
// 1. Find the user and verify the password
// 2. Issue a short-lived access token (JWT)
// 3. Issue a long-lived refresh token; store only its hash in the database
// ---------------------------------------------------------------------------
export const login = async (
  data: LoginInput
): Promise<LoginResult> => {
  const { email, password } = data;

  const user = await userRepository.findByEmail(email);

  // Same error for "user not found" and "wrong password" so attackers can't
  // find out which emails are registered.
  if (!user) {
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  const passwordValid = await argon2.verify(user.password_hash, password);

  if (!passwordValid) {
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  const accessToken = generateAccessToken(user.id);

  // The raw token goes to the client (cookie). Only the hash goes to the DB.
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);

  await refreshTokenRepository.createRefreshToken(
    user.id,
    tokenHash,
    getRefreshTokenExpiry()
  );

  return { user, accessToken, refreshToken };
};

// ---------------------------------------------------------------------------
// REFRESH (token rotation)
// Every refresh gives the client a NEW refresh token and kills the old one.
// If a stolen token is used after the real user already rotated it, it fails.
// ---------------------------------------------------------------------------
export const refresh = async (
  token: string
): Promise<{ accessToken: string; refreshToken: string }> => {
  const oldTokenHash = hashRefreshToken(token);

  // Prepare the replacement token before touching the database.
  const newRefreshToken = generateRefreshToken();
  const newTokenHash = hashRefreshToken(newRefreshToken);

  // Atomic: revoke old + create new in one SQL statement (see repository).
  // Returns null if the old token is invalid, expired, revoked, or was just
  // used by another concurrent request.
  const newSession = await refreshTokenRepository.rotate(
    oldTokenHash,
    newTokenHash,
    getRefreshTokenExpiry()
  );

  if (!newSession) {
    // rotate() failed. Find out WHY, because the reason matters:
    //  - token exists AND was already revoked -> REUSE (possible theft)
    //  - token doesn't exist, or just expired -> plain invalid token
    const existing = await refreshTokenRepository.findByTokenHash(oldTokenHash);

    if (existing?.revoked_at) {
      // A revoked token should never come back. The real user already rotated
      // it, so whoever is presenting it now probably copied it. We can't tell
      // which side is the attacker, so kill EVERY session of this user and
      // force a fresh login on all devices.
      await refreshTokenRepository.revokeAllForUser(existing.user_id);

      throw new AppError("Refresh token reuse detected. Please log in again.", 401, "REFRESH_TOKEN_REUSED");
    }

    throw new AppError("Invalid or expired refresh token", 401, "INVALID_REFRESH_TOKEN");
  }

  const accessToken = generateAccessToken(newSession.user_id);

  return { accessToken, refreshToken: newRefreshToken };
};

// ---------------------------------------------------------------------------
// LOGOUT (idempotent)
// Goal: after logout, the session must be dead. If there is no token or the
// session is already gone/expired, the goal is already met, so don't throw.
// This also guarantees the controller always reaches res.clearCookie().
// ---------------------------------------------------------------------------
export const logout = async (
  token: string | undefined
): Promise<void> => {
  if (!token) return;

  const tokenHash = hashRefreshToken(token);
  const session = await refreshTokenRepository.findActiveByTokenHash(tokenHash);

  if (session) {
    await refreshTokenRepository.revokeById(session.id);
  }
};