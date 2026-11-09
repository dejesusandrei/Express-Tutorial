import type { Request, Response } from "express";

import type { ApiResult } from "../types/Api.js";
import * as passwordResetService from "../services/passwordReset.service.js";



// POST /api/auth/forgot-password   body: { email }
//
// ALWAYS the same answer: 200 and the same message, whether the email exists
// or not. If we said "no account with that email", attackers could test
// thousands of emails and learn who is registered.
export const forgotPassword = async (
  req: Request,
  res: Response<ApiResult<{ message: string }>>
) => {
  await passwordResetService.requestPasswordReset(req.body.email);

  res.status(200).json({
    success: true,
    data: {
      message: "If an account exists for that email, a reset link has been sent."
    }
  });
};

// POST /api/auth/reset-password   body: { token, password }
export const resetPassword = async (
  req: Request,
  res: Response<ApiResult<{ message: string }>>
) => {
  const { token, password } = req.body;

  await passwordResetService.resetPassword(token, password);

  res.status(200).json({
    success: true,
    data: {
      message: "Password updated. Please log in with your new password.",
    }
  });
};
