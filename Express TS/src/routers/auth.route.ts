import { Router } from "express";

import { forgotPassword, resetPassword } from "../controllers/passwordReset.controller.js";
import { register, login, refresh, logout } from "../controllers/auth.controller.js";
import { verifyEmail, resendVerification } from "../controllers/emailVerification.controller.js";

import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { forgotPasswordRateLimit, resetPasswordRateLimit } from "../middleware/rateLimit.js";
import { loginRateLimit, registerRateLimit, refreshRateLimit } from "../middleware/rateLimit.js";
import { verifyEmailRateLimit, resendVerificationRateLimit } from "../middleware/rateLimit.js";

import { VerifyEmailSchema, ResendVerificationSchema } from "../schema/emailVerification.schema.js";
import { ForgotPasswordSchema, ResetPasswordSchema } from "../schema/passwordReset.schema.js";
import { CreateUserSchema } from "../schema/user.schema.js";
import { LoginSchema } from "../schema/auth.schema.js";

const router = Router();

router.post(
  "/register",
  registerRateLimit, 
  validate(CreateUserSchema),
  asyncHandler(register)
);

router.post(
  "/login",
  loginRateLimit,
  validate(LoginSchema),
  asyncHandler(login)
);

router.post(
  "/refresh",
  refreshRateLimit,
  asyncHandler(refresh)
);

router.post(
  '/logout',
  asyncHandler(logout)
);

router.post(
  "/forgot-password",
  forgotPasswordRateLimit,
  validate(ForgotPasswordSchema),
  asyncHandler(forgotPassword)
);

router.post(
  "/reset-password",
  resetPasswordRateLimit,
  validate(ResetPasswordSchema),
  asyncHandler(resetPassword)
);

router.post(
  "/verify-email",
  verifyEmailRateLimit,
  validate(VerifyEmailSchema),
  asyncHandler(verifyEmail)
);

router.post(
  "/resend-verification",
  resendVerificationRateLimit,
  validate(ResendVerificationSchema),
  asyncHandler(resendVerification)
);



export default router;