export interface Task {
  id: string;
  owner_id: string;
  title: string;
  completed: boolean;
  created_at: Date;
};

export type CreateTaskData = {
  owner_id: string;
  title: string;
  completed?: boolean;
};