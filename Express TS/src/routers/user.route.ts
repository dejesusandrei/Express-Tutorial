import { Router } from "express";
import {  getUsers, getUserById, getCurrentUser, createUser, deleteUser } from '../controllers/user.controller'
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/requireRole";

// Middleware
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

// Schema
import { CreateUserSchema } from "../schema/user.schema.js";

const router = Router();

// GET
router.get(
  '/me', 
  authMiddleware, 
  asyncHandler(getCurrentUser)
);

router.get(
  '/',
  asyncHandler(getUsers)
);

router.get(
  '/:id',
  asyncHandler(getUserById)
);


// POST
router.post(
  '/',
  validate(CreateUserSchema),
  asyncHandler(createUser)
);

// DELETE
router.delete(
  '/:id',
  authMiddleware,
  requireRole('admin'),
  asyncHandler(deleteUser)
);



export default router;