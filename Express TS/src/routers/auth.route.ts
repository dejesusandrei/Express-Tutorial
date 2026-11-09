import { Router } from "express";

import { forgotPassword, resetPassword } from "../controllers/passwordReset.controller.js";
import { register, login, refresh, logout } from "../controllers/auth.controller.js";

import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { forgotPasswordRateLimit, resetPasswordRateLimit } from "../middleware/rateLimit.js";
import { loginRateLimit, registerRateLimit, refreshRateLimit } from "../middleware/rateLimit.js";


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
export default router;