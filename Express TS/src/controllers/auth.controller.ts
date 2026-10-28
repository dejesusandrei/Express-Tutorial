import type { Request, Response } from "express";

// Types
import type { User } from "../types/User.js";
import type { ApiResult } from "../types/Api.js";

// services
import * as authService from "../services/auth.service.js";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";

export const register = async (
  req: Request,
  res: Response<ApiResult<{ user: Omit<User, "password_hash"> }>>
) => {
  const user = await authService.register(req.body);

  const { password_hash, ...safeUser } = user;

  res.status(201).json({
    success: true,
    data: {
      user: safeUser
    }
  });
};



// Setting	Purpose
// httpOnly: true	Hindi direktang mababasa ng browser JavaScript ang cookie.
// secure	HTTPS lang sa production.
// sameSite: "lax"	Karagdagang proteksiyon laban sa ilang cross-site request.
// path: "/api/auth"	Ipapadala ang cookie sa mga endpoint sa ilalim ng /api/auth.
// maxAge	Pitong araw ang cookie lifetime.

export const login = async (
  req: Request,
  res: Response<ApiResult<{
    user: Omit<User, "password_hash">;
    accessToken: string
  }>>
) => {
  const result = await authService.login(req.body);

  const { password_hash, ...safeUser } = result.user;

  res.cookie("refreshToken", result.refreshToken, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.status(200).json({
    success: true,
    data: {
      user: safeUser,
      accessToken: result.accessToken
    }
  });
};


export const refresh = async (
  req: Request,
  res: Response<ApiResult<{ accessToken: string }>>
) => {
  const token = req.cookies?.refreshToken as string | undefined;

  if (!token) {
    throw new AppError("Refresh token is required", 401, "AUTH_REQUIRED");
  }

  const result = await authService.refresh(token);

  res.cookie("refreshToken", result.refreshToken, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.status(200).json({
    success: true,
    data: {
      accessToken: result.accessToken
    }
  });
};


export const logout = async (
  req: Request,
  res: Response<ApiResult<{ message: string }>>
) => {
  console.log("Cookies received:", req.cookies);
  const token = req.cookies?.refreshToken as string | undefined;

  await authService.logout(token);

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    path: "/api/auth"
  });

  res.status(200).json({
    success: true,
    data: {
      message: "Logged out successfully"
    }
  });
};


