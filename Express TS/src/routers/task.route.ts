import { Router } from "express";
import { getMyTask, getTaskById, createTask, updateTask, deleteTask } from '../controllers/task.controller'

// Middleware
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

// Schema
import { CreateTaskSchema, TaskIdSchema, UpdateTaskSchema } from "../schema/task.schema";
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
  validate(TaskIdSchema, "params"),
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
  validate(TaskIdSchema, "params"),
  validate(UpdateTaskSchema),
  asyncHandler(updateTask)
);

// DELETE
router.delete(
  '/:id',
  authMiddleware,
  validate(TaskIdSchema, "params"),
  asyncHandler(deleteTask)
);


export default router;