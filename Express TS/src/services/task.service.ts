import type { Task, CreateTaskData } from '../types/Task'
import * as taskRepository from '../repositories/task.repository'
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
  const task = await taskRepository.deleteByIdForUser(taskId, owner_id);

  if (!task) {
    throw new AppError("Task not found", 404, "TASK_NOT_FOUND");
  }

  return task;
};

export const getPaginatedTasks = async (
  ownerId: string,
  page: number,
  limit: number
)  => {
  const offset = (page - 1) * limit;

  const [tasks, totalItems] = await Promise.all([
    taskRepository.findAllPaginated(ownerId, limit, offset),
    taskRepository.countByOwner(ownerId)
  ]);

  // Math.ceil is used to round up the total number of pages, 
  // ensuring that any remaining items that don't fill a complete page are still accounted for in the pagination.
  return {
    tasks,
    pagination: {
      currentPage: page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit)
    }
  };
};