import type { Task } from '../types/Task'
import * as taskRepository from '../repositories/task.repository'
import * as userService from '../services/user.service'
import { type CreateTaskInput } from '../schema/task.schema'
import { AppError } from "../errors/AppError.js";

export const getTask = async (): Promise<Task[]> => {
  return taskRepository.findAll();
};

export const getTasksById = async (id: string): Promise<Task> => {
  const task = await taskRepository.findById(id);

  if(!task){
    throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
  }

  return task;
};

// FOR OWNERSHIP
export const getTaskByIdForUser = async (
  taskId: string,
  userId: string
): Promise<Task> => {
  const task = await taskRepository.findById(taskId);

  if (!task) {
    throw new AppError(
      "Task not found",
      404,
      "TASK_NOT_FOUND"
    );
  }

  if (task.ownerId !== userId) {
    throw new AppError(
      "You do not have permission to access this task",
      403,
      "FORBIDDEN"
    );
  }

  return task;
};

export const createTask = async (
  data: CreateTaskInput
): Promise<Task> => {
  const { title, completed } = data;

  const task: Task = {
    id: crypto.randomUUID(),
    title,
    completed,
    ownerId: data.ownerId
  };

  return taskRepository.create(task);
}

export const deleteTaskForUser = async (
  taskId: string,
  userId: string
): Promise<Task> => {
  const task = await taskRepository.findById(taskId);

  if (!task) {
    throw new AppError("Task not found", 404, "TASK_NOT_FOUND");
  }

  const user = await userService.getUserById(userId);

  const isOwner = task.ownerId === userId; // true
  const isAdmin = user.role === "admin"; // false: bcs you are user role

  if (!isOwner && !isAdmin) {
    throw new AppError("You do not have permission to delete this task", 403, "FORBIDDEN");
  }

  const deletedTask = await taskRepository.deleteById(taskId);

  if (!deletedTask) {
    throw new AppError("Task not found", 404, "TASK_NOT_FOUND");
  }

  return deletedTask;
};