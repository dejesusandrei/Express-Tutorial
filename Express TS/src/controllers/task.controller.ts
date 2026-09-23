import { Request, Response } from "express";
import type { Task } from '../types/Task'
import * as taskService from '../services/task.service'

import { AppError } from "../errors/AppError.js";
import type { ApiResult } from "../types/Api.js";


// GET
export const getTasks = async (
  req: Request,
  res: Response<ApiResult<{ tasks: Task[] }>>
) => {
  const tasks = await taskService.getTask();

  res.status(200).json({
    success: true,
    data: {
      tasks,
    },
  });
};

export const getTaskById = async (
  req: Request,
  res: Response<ApiResult<{ task: Task }>>
) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  const { id } = req.params;

  if (typeof id !== "string") {
    throw new AppError("Invalid task id", 400, "INVALID_TASK_ID");
  }

  const task = await taskService.getTaskByIdForUser(id, userId);

  res.status(200).json({
    success: true,
    data: {
      task
    },
  });
};


// POST
export const createTask = async (
  req: Request,
  res: Response<ApiResult<{ task: Task }>>
) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  const { title, completed } = req.body;

  const task = await taskService.createTask({
    title,
    completed,
    ownerId: userId
  });

  res.status(201).json({
    success: true,
    data: {
      task
    },
  });
};


// DELETE
export const deleteTask = async (
  req: Request,
  res: Response<ApiResult<{ task: Task }>>
) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  const { id } = req.params;

  if (typeof id !== "string") {
    throw new AppError("Invalid task ID" , 400, "INVALID_TASK_ID");
  }

  const task = await taskService.deleteTaskForUser(id, userId);

  res.status(200).json({
    success: true,
    data: {
      task
    }
  });
};
