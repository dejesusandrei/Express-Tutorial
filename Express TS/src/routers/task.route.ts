import { Router } from "express";
import { getTasks, getTaskById, createTask, deleteTask } from '../controllers/task.controller'

// Middleware
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

// Schema
import { CreateTaskSchema } from "../schema/task.schema";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

// GET
router.get(
  "/", 
  asyncHandler(getTasks)
);

router.get(
  "/:id", 
  authMiddleware,
  asyncHandler(getTaskById)
);

// POST
router.post(
  "/", 
  validate(CreateTaskSchema), 
  asyncHandler(createTask)
);

// DELETE
router.delete(
  '/:id',
  authMiddleware,
  asyncHandler(deleteTask)
);


export default router;