import type { Request, Response } from "express";

import type { ApiResult } from "../types/Api.js";
import * as emailVerificationService from "../services/emailVerification.service.js";

/**
 * ============================================================================
 * EMAIL VERIFICATION: HTTP part
 * ============================================================================
 * req.body is already cleaned and checked by validate(...) in the route.
 * ============================================================================
 */


// POST /api/auth/verify-email   body: { token }
export const verifyEmail = async (
  req: Request,
  res: Response<ApiResult<{ message: string }>>
) => {
  await emailVerificationService.verifyEmail(req.body.token);

  res.status(200).json({
    success: true,
    data: { message: "Email verified. You can now log in." },
  });
};

// POST /api/auth/resend-verification   body: { email }
//
// ALWAYS the same answer, whether the email exists, is already verified, or
// doesn't exist at all. Otherwise attackers could use this form to find out
// who is registered.
export const resendVerification = async (
  req: Request,
  res: Response<ApiResult<{ message: string }>>
) => {
  await emailVerificationService.resendVerification(req.body.email);

  res.status(200).json({
    success: true,
    data: {
      message:
        "If that account exists and is not verified yet, a new link has been sent.",
    },
  });
};