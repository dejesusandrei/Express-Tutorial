import { Router } from "express";
import { getMyTask, getTaskById, createTask, updateTask, deleteTask } from '../controllers/task.controller'

// Middleware
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

// Schema
import { CreateTaskSchema, UpdateTaskSchema } from "../schema/task.schema";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

// GET
router.get(
  "/", 
  authMiddleware,
  asyncHandler(getMyTask)
);

router.get(
  "/:id", 
  authMiddleware,
  asyncHandler(getTaskById)
);

// POST
router.post(
  "/", 
  authMiddleware,
  validate(CreateTaskSchema), 
  asyncHandler(createTask)
);

// PUT
router.put(
  "/:id",
  authMiddleware,
  validate(UpdateTaskSchema),
  asyncHandler(updateTask)
);

// DELETE
router.delete(
  '/:id',
  authMiddleware,
  asyncHandler(deleteTask)
);


export default router;