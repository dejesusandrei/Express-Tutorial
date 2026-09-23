import { Router } from "express";

import { register, login } from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { loginRateLimit } from "../middleware/rateLimit.js";

import { CreateUserSchema } from "../schema/user.schema.js";
import { LoginSchema } from "../schema/auth.schema.js";

const router = Router();

router.post(
  "/register", 
  validate(CreateUserSchema),
  asyncHandler(register)
);

router.post(
  "/login",
  loginRateLimit,
  validate(LoginSchema),
  asyncHandler(login)
);

export default router;