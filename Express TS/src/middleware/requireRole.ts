import type { Request, Response, NextFunction } from "express";

import type { UserRole } from "../types/User.js";
import { AppError } from "../errors/AppError.js";
import * as userService from "../services/user.service.js";

export const requireRole = (role: UserRole) => {
  return async (
    req: Request, 
    res: Response, 
    next: NextFunction
  ) => {
    const userId = req.user?.userId;

    if(!userId){
      return next( new AppError('Authentication required', 401, 'AUTH_REQUIRED') )
    }

    const user = await userService.getUserById(userId);

    if (user.role !== role) {
      return next( new AppError("You do not have permission to perform this action", 403,"FORBIDDEN" ));
    }

    next();
  };
};