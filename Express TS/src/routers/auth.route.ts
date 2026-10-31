import { Router } from "express";

import { register, login, refresh, logout } from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { loginRateLimit, registerRateLimit, refreshRateLimit } from "../middleware/rateLimit.js";

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

export default router;