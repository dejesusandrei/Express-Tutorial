import type { Request, Response } from "express";

import type { User } from "../types/User.js";
import type { ApiResult } from "../types/Api.js";

import * as userService from "../services/user.service.js";
import { AppError } from "../errors/AppError.js";


// GET
export const getUsers = async (
  req: Request,
  res: Response<ApiResult<{ users: User[] }>>
) => {
  const users = await userService.getUsers();

  res.status(200).json({
    success: true,
    data: {
      users,
    },
  });
};

export const getUserById = async (
  req: Request,
  res: Response<ApiResult<{ user: User }>>
) => {
  const { id } = req.params;

  if (typeof id !== "string") {
    throw new AppError("Invalid user id", 400, "INVALID_USER_ID");
  }

  const user = await userService.getUserById(id);

  res.status(200).json({
    success: true,
    data: {
      user,
    },
  });
};

// DELETE
export const deleteUser = async (
  req: Request,
  res: Response<ApiResult<{ user: Omit<User, "password_hash">}>>
) => {
  const { id } = req.params;

  if (typeof id !== "string") {
    throw new AppError("Invalid user id", 400, "INVALID_USER_ID");
  }

  const user = await userService.deleteUser(id);

  const { password_hash, ...safeUser } = user;

  res.status(200).json({
    success: true,
    data: {
      user: safeUser
    }
  });
}


export const getCurrentUser = async (
  req: Request,
  res: Response<ApiResult<{ user: Omit<User, "password_hash"> }>>
) => {
  const userId = req.user?.userId;

  if(!userId){
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const user = await userService.getUserById(userId);

  const { password_hash, ...safeUser } = user;

  res.status(200).json({
    success: true,
    data: {
      user: safeUser
    }
  });
};