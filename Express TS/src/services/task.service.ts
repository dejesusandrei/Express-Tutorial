import type { Task, CreateTaskData } from '../types/Task'
import * as taskRepository from '../repositories/task.repository'
import * as userService from '../services/user.service'
import { type CreateTaskInput } from '../schema/task.schema'
import { AppError } from "../errors/AppError.js";

export const getTask = async (
  owner_id: string
): Promise<Task[]> => {
  return taskRepository.findAll(owner_id);
};

// FOR OWNERSHIP
export const getTaskByIdForUser = async (
  taskId: string,
  owner_id: string
): Promise<Task> => {
  const task = await taskRepository.findById(taskId, owner_id);

  if (!task) {
    throw new AppError("Task not found", 404, "TASK_NOT_FOUND"
    );
  }

  return task;
};

export const createTask = async (
  owner_id: string,
  data: CreateTaskInput
): Promise<Task> => {
  const { title, completed } = data;

  const task: CreateTaskData = {
    owner_id,
    title,
    completed,
  };

  return taskRepository.create(task);
}

export const updateTaskForUser = async (
  taskId: string,
  owner_id: string,
  data: CreateTaskInput
): Promise<Task> => {
  const task = await taskRepository.updateForUser(
    taskId,
    owner_id,
    data.title,
    data.completed
  );

  if (!task) {
    throw new AppError("Task not found", 404, "TASK_NOT_FOUND");
  }

  return task;
};

export const deleteTaskForUser = async (
  taskId: string,
  owner_id: string
): Promise<Task> => {
  const task = await taskRepository.findById(taskId, owner_id);

  if (!task) {
    throw new AppError("Task not found", 404, "TASK_NOT_FOUND");
  }

  const user = await userService.getUserById(owner_id);

  const isOwner = task.owner_id === owner_id; // true
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