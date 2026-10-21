import type { Request, Response } from "express";

// Types
import type { User } from "../types/User.js";
import type { ApiResult } from "../types/Api.js";

// services
import * as authService from "../services/auth.service.js";
import { env } from "../config/env.js";

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

// Setting	Purpose
// httpOnly: true	Hindi direktang mababasa ng browser JavaScript ang cookie.
// secure	HTTPS lang sa production.
// sameSite: "lax"	Karagdagang proteksiyon laban sa ilang cross-site request.
// path: "/api/auth"	Ipapadala ang cookie sa mga endpoint sa ilalim ng /api/auth.
// maxAge	Pitong araw ang cookie lifetime.