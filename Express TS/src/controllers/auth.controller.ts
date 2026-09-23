import type { Request, Response } from "express";

// Types
import type { User } from "../types/User.js";
import type { ApiResult } from "../types/Api.js";

// services
import * as authService from "../services/auth.service.js";
import { tr } from "zod/v4/locales/index.js";

export const register = async (
  req: Request,
  res: Response<ApiResult<{ user: Omit<User, "passwordHash"> }>>
) => {
  const user = await authService.register(req.body);

  const { passwordHash, ...safeUser } = user;

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
    user: Omit<User, "passwordHash">;
    accessToken: string
  }>>
) => {
  const result = await authService.login(req.body);

  const { passwordHash, ...safeUser } = result.user;

  res.status(200).json({
    success: true,
    data: {
      user: safeUser,
      accessToken:  result.accessToken
    }
  });
};