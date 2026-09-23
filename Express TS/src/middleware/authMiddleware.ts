import type { Request, Response, NextFunction } from "express";
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { AppError } from "../errors/AppError.js";


export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AppError( "Authentication required", 401, "AUTH_REQUIRED" );
  }

  // scheme: bearer, token: 8414bfewr....
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new AppError( "Authentication required", 401, "AUTH_REQUIRED" );
  }

  try {
    // Verify the JWT using our secret key.
    //
    // This checks:
    // 1. Is the token valid?
    // 2. Was it signed using our JWT_SECRET?
    // 3. Has it expired?
    const decoded = jwt.verify( token, env.jwtSecret );

    // Make sure the decoded JWT contains
    // the userId that our application expects.
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      !("userId" in decoded) ||
      typeof decoded.userId !== "string"
    ) {
      return next(
        new AppError(
          "Invalid token",
          401,
          "INVALID_TOKEN"
        )
      );
    }

    req.user = {
      userId: decoded.userId
    };

    next();
  } catch {
    return next(
      new AppError(
        "Invalid or expired token",
        401,
        "INVALID_TOKEN"
      )
    );
  }
};




