import type { ErrorRequestHandler } from "express";
import { AppError } from "../errors/AppError.js";

// centralized error handling
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  console.error(err);

  // Handle expected application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      message: err.message
    });
    return;
  }

  // Handle unexpected errors
  res.status(500).json({
    message: "Internal server error"
  });
};